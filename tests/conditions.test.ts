import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { borrowBook, returnLoan } from "@/lib/loans";
import { runReminderJob, adminLateText } from "@/lib/reminders";
import { CONDITIONS, CONDITION_LABEL, conditionChip, isCondition, isUnusable, stockLoss } from "@/lib/conditions";
import { setLoanWorkingDays } from "@/lib/settings";
import { startMockWaha, resetDb } from "./helpers";

let waha: Awaited<ReturnType<typeof startMockWaha>>;

beforeEach(async () => {
  waha = await startMockWaha();
  await resetDb();
  waha.calls.length = 0;
  waha.state.failNext = 0;
  // Matematika tanggal pengingat di berkas ini ditulis untuk aturan 3 hari
  // kerja (mekanisme lama). Aturannya dipatok di sini supaya tes menguji
  // perilaku pengingat, bukan ikut berubah tiap kebijakan lama pinjam berubah.
  await setLoanWorkingDays(3);
});
afterEach(async () => {
  await waha.close();
});
afterAll(async () => {
  await prisma.$disconnect();
});

const wib = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+07:00`);

async function mkBook(stock = 1) {
  return prisma.book.create({ data: { title: "Atomic Habits", author: "James Clear", stock } });
}
async function mkUser(name = "Tia", phone = "6281111111111", role: "MEMBER" | "ADMIN" = "MEMBER") {
  return prisma.user.create({ data: { name, phone, passwordHash: "x", role } });
}

describe("kondisi buku — aturan dasar", () => {
  it("hanya HILANG yang mengurangi stok", () => {
    expect(stockLoss("BAIK")).toBe(0);
    expect(stockLoss("RUSAK_RINGAN")).toBe(0);
    expect(stockLoss("RUSAK_BERAT")).toBe(0);
    expect(stockLoss("HILANG")).toBe(1);
  });

  it("rusak berat & hilang tidak layak dipinjam", () => {
    expect(isUnusable("BAIK")).toBe(false);
    expect(isUnusable("RUSAK_RINGAN")).toBe(false);
    expect(isUnusable("RUSAK_BERAT")).toBe(true);
    expect(isUnusable("HILANG")).toBe(true);
  });

  it("semua kondisi punya label dan warna chip", () => {
    for (const c of CONDITIONS) {
      expect(CONDITION_LABEL[c]).toBeTruthy();
      expect(conditionChip(c)).toMatch(/green|amber|red/);
    }
  });

  it("menolak nilai kondisi sembarang", () => {
    expect(isCondition("BAIK")).toBe(true);
    expect(isCondition("HANCUR")).toBe(false);
    expect(isCondition(null)).toBe(false);
    expect(isCondition(123)).toBe(false);
  });
});

describe("pengembalian dengan kondisi", () => {
  it("kembali baik: stok tidak berubah, kondisi tercatat", async () => {
    const u = await mkUser();
    const b = await mkBook(1);
    const loan = await borrowBook(u.id, b.id, wib("2026-11-19", "09:00"));
    const done = await returnLoan(loan.id, "USER", wib("2026-11-20", "09:00"), "BAIK");
    expect(done.condition).toBe("BAIK");
    expect((await prisma.book.findUniqueOrThrow({ where: { id: b.id } })).stock).toBe(1);
  });

  it("hilang: stok berkurang 1", async () => {
    const u = await mkUser();
    const b = await mkBook(3);
    const loan = await borrowBook(u.id, b.id, wib("2026-11-19", "09:00"));
    await returnLoan(loan.id, "ADMIN", wib("2026-11-20", "09:00"), "HILANG", "tidak dikembalikan");
    const after = await prisma.book.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.stock).toBe(2);
    const l = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(l.condition).toBe("HILANG");
    expect(l.conditionNote).toBe("tidak dikembalikan");
  });

  it("rusak berat: stok tetap, kondisi tercatat", async () => {
    const u = await mkUser();
    const b = await mkBook(2);
    const loan = await borrowBook(u.id, b.id, wib("2026-11-19", "09:00"));
    await returnLoan(loan.id, "ADMIN", wib("2026-11-20", "09:00"), "RUSAK_BERAT", "basah kena air");
    expect((await prisma.book.findUniqueOrThrow({ where: { id: b.id } })).stock).toBe(2);
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } })).condition).toBe("RUSAK_BERAT");
  });

  it("stok tidak bisa jadi minus walau hilang berulang", async () => {
    const u = await mkUser();
    const b = await mkBook(1);
    const loan = await borrowBook(u.id, b.id, wib("2026-11-19", "09:00"));
    await returnLoan(loan.id, "ADMIN", wib("2026-11-20", "09:00"), "HILANG");
    const after = await prisma.book.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.stock).toBe(0);
    expect(after.stock).toBeGreaterThanOrEqual(0);
  });

  it("catatan kondisi dibatasi 300 karakter", async () => {
    const u = await mkUser();
    const b = await mkBook(1);
    const loan = await borrowBook(u.id, b.id, wib("2026-11-19", "09:00"));
    const done = await returnLoan(loan.id, "ADMIN", wib("2026-11-20", "09:00"), "RUSAK_RINGAN", "x".repeat(500));
    expect(done.conditionNote!.length).toBe(300);
  });

  it("tidak bisa mengembalikan dua kali", async () => {
    const u = await mkUser();
    const b = await mkBook(1);
    const loan = await borrowBook(u.id, b.id, wib("2026-11-19", "09:00"));
    await returnLoan(loan.id, "USER", wib("2026-11-20", "09:00"));
    await expect(returnLoan(loan.id, "USER", wib("2026-11-20", "10:00"))).rejects.toMatchObject({ code: "ALREADY_RETURNED" });
  });
});

describe("rekap keterlambatan untuk admin", () => {
  it("admin dapat rekap harian berisi buku terlambat", async () => {
    const admin = await mkUser("Bos", "6281220210193", "ADMIN");
    const member = await mkUser("Tia", "6281111111111");
    const b = await mkBook(1);
    const loan = await borrowBook(member.id, b.id, wib("2026-11-16", "09:00"));
    // jatuh tempo 2026-11-19, sekarang 2026-11-21 -> telat 2 hari

    const r = await runReminderJob({ now: wib("2026-11-21", "09:00"), ignoreWindow: false, delayMs: () => 0 });
    expect(r.adminSent).toBe(1);
    expect(r.adminFailed).toBe(0);

    const toAdmin = waha.calls.filter((c) => c.body.chatId === "6281220210193@c.us");
    expect(toAdmin).toHaveLength(1);
    expect(toAdmin[0].body.text).toContain("Rekap keterlambatan");
    expect(toAdmin[0].body.text).toContain("Tia");
    expect(toAdmin[0].body.text).toContain("Atomic Habits");
    expect(toAdmin[0].body.text).toContain("telat 2 hari");

    // peminjam tetap dapat pengingat pribadi
    const toMember = waha.calls.filter((c) => c.body.chatId === "6281111111111@c.us");
    expect(toMember.length).toBeGreaterThanOrEqual(1);
  });

  it("admin yang juga meminjam dapat pengingat pribadi DAN rekap", async () => {
    const admin = await mkUser("Bos", "6281220210193", "ADMIN");
    const other = await mkUser("Tia", "6281111111111");
    const b1 = await mkBook(1);
    const b2 = await prisma.book.create({ data: { title: "Deep Work", author: "Cal Newport", stock: 1 } });
    await borrowBook(admin.id, b1.id, wib("2026-11-16", "09:00"));
    await borrowBook(other.id, b2.id, wib("2026-11-16", "09:00"));

    const r = await runReminderJob({ now: wib("2026-11-21", "09:00"), delayMs: () => 0 });
    expect(r.sent).toBe(2);      // dua peminjam dapat pengingat pribadi
    expect(r.adminSent).toBe(1); // plus satu rekap

    const toAdmin = waha.calls.filter((c) => c.body.chatId === "6281220210193@c.us");
    expect(toAdmin).toHaveLength(2);
    const texts = toAdmin.map((c) => c.body.text);
    expect(texts.some((t) => t.includes("Rekap keterlambatan"))).toBe(true);
    expect(texts.some((t) => t.includes("Pengingat dari Bertumbuh Bareng Zaneva"))).toBe(true);
  });

  it("rekap hanya sekali per hari walau job jalan berkali-kali", async () => {
    await mkUser("Bos", "6281220210193", "ADMIN");
    const member = await mkUser("Tia", "6281111111111");
    const b = await mkBook(1);
    await borrowBook(member.id, b.id, wib("2026-11-16", "09:00"));

    await runReminderJob({ now: wib("2026-11-21", "09:00"), delayMs: () => 0 });
    const first = waha.calls.filter((c) => c.body.chatId === "6281220210193@c.us").length;
    expect(first).toBe(1);

    await runReminderJob({ now: wib("2026-11-21", "10:00"), delayMs: () => 0 });
    await runReminderJob({ now: wib("2026-11-21", "11:00"), delayMs: () => 0 });
    const total = waha.calls.filter((c) => c.body.chatId === "6281220210193@c.us").length;
    expect(total).toBe(1); // tidak dobel
  });

  it("tidak ada buku terlambat = tidak kirim rekap", async () => {
    await mkUser("Bos", "6281220210193", "ADMIN");
    const r = await runReminderJob({ now: wib("2026-11-21", "09:00"), delayMs: () => 0 });
    expect(r.adminSent ?? 0).toBe(0);
    expect(r.adminSkipped).toContain("tidak ada");
    expect(waha.calls).toHaveLength(0);
  });

  it("gagal kirim rekap tidak menggagalkan job, dan tidak menutup kesempatan coba lagi", async () => {
    await mkUser("Bos", "6281220210193", "ADMIN");
    const member = await mkUser("Tia", "6281111111111");
    const b = await mkBook(1);
    await borrowBook(member.id, b.id, wib("2026-11-16", "09:00"));

    waha.state.failNext = 99; // semua kirim gagal
    const r = await runReminderJob({ now: wib("2026-11-21", "09:00"), delayMs: () => 0 });
    expect(r.adminFailed).toBe(1);
    expect(r.adminSent ?? 0).toBe(0);

    // penanda harian dihapus -> percobaan berikutnya masih boleh kirim
    waha.state.failNext = 0;
    const r2 = await runReminderJob({ now: wib("2026-11-21", "11:00"), delayMs: () => 0 });
    expect(r2.adminSent).toBe(1);
  });

  it("daftar panjang dipotong 10 baris + keterangan sisanya", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ name: `Orang${i}`, title: `Buku${i}`, daysLate: 3 }));
    const t = adminLateText(rows, 14);
    expect(t).toContain("14 buku belum dikembalikan");
    expect(t).toContain("dan 4 lainnya");
    // 10 baris buku + 1 baris "… dan 4 lainnya" = 11 baris berbullet
    expect(t.split("\n").filter((l) => l.startsWith("•")).length).toBe(11);
  });

  it("teks rekap memuat semua buku kalau tidak lebih dari 10", () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ name: `Orang${i}`, title: `Buku${i}`, daysLate: 1 }));
    const t = adminLateText(rows, 3);
    expect(t).not.toContain("lainnya");
    expect(t.split("\n").filter((l) => l.startsWith("•")).length).toBe(3);
  });
});
