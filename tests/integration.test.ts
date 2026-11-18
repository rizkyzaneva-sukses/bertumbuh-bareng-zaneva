import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { borrowBook, effectiveStatus, returnLoan, AppError } from "@/lib/loans";
import { runReminderJob } from "@/lib/reminders";
import { verifyReturnToken } from "@/lib/tokens";
import { getDashboard } from "@/lib/stats";
import { seedAdmins, seedBooks, seedBooksOnce } from "@/lib/seed";
import { keyFromDbDate } from "@/lib/dates";
import { startMockWaha, resetDb } from "./helpers";

let waha: Awaited<ReturnType<typeof startMockWaha>>;
beforeAll(async () => {
  waha = await startMockWaha();
});
afterAll(async () => {
  await waha.close();
  await prisma.$disconnect();
});

// 2026-11-16 = Senin. Waktu di bawah ini dalam WIB (UTC+7).
const wib = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+07:00`);

async function mk() {
  const u = await prisma.user.create({ data: { name: "Tia", phone: "6281111111111", passwordHash: "x" } });
  const b = await prisma.book.create({ data: { title: "Atomic Habits", author: "James Clear" } });
  return { u, b };
}

beforeEach(async () => {
  await resetDb();
  waha.calls.length = 0;
  waha.state.failNext = 0;
});

describe("seed", () => {
  it("admin awal & katalog 37 buku, tanpa halaman karangan", async () => {
    await seedAdmins();
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, orderBy: { phone: "asc" } });
    expect(admins.map((a) => a.phone)).toEqual(["6281220210193", "6285177555437"]);
    expect(admins.every((a) => a.mustChangePassword && a.tempPassword === "Zaneva2026")).toBe(true);
    expect(await seedBooksOnce()).toBe(37);
    expect(await prisma.book.count()).toBe(37);
    expect(await prisma.book.count({ where: { pages: { not: null } } })).toBe(0);
    const ah = await prisma.book.findFirstOrThrow({ where: { title: "Atomic Habits" } });
    expect(ah.synopsis).toContain("kebiasaan belajar 10 menit");
    // idempoten: buku yang dihapus admin tidak muncul lagi
    await prisma.book.delete({ where: { id: ah.id } });
    expect(await seedBooksOnce()).toBe(0);
    expect(await seedBooks()).toBe(1); // perintah manual menambah yang hilang saja
    // seedAdmins tidak menimpa password yang sudah diganti
    await prisma.user.update({ where: { phone: "6281220210193" }, data: { passwordHash: "baru", mustChangePassword: false, tempPassword: null } });
    await seedAdmins();
    const r = await prisma.user.findUniqueOrThrow({ where: { phone: "6281220210193" } });
    expect(r.passwordHash).toBe("baru");
  });
});

describe("peminjaman", () => {
  it("jatuh tempo 3 hari kerja & lewati Ahad (Kamis -> Senin)", async () => {
    const { u, b } = await mk();
    const loan = await borrowBook(u.id, b.id, wib("2026-11-19", "10:00"));
    expect(keyFromDbDate(loan.dueDate)).toBe("2026-11-23");
    expect(loan.status).toBe("DIPINJAM");
  });

  it("maksimal 2 buku aktif; setelah balik bisa pinjam lagi", async () => {
    const { u, b } = await mk();
    const b2 = await prisma.book.create({ data: { title: "Deep Work", author: "Cal Newport" } });
    const b3 = await prisma.book.create({ data: { title: "Essentialism", author: "Greg McKeown" } });
    const now = wib("2026-11-16", "09:00");
    const l1 = await borrowBook(u.id, b.id, now);
    await borrowBook(u.id, b2.id, now);
    await expect(borrowBook(u.id, b3.id, now)).rejects.toMatchObject({ code: "LIMIT" });
    await returnLoan(l1.id, "USER", now);
    await expect(borrowBook(u.id, b3.id, now)).resolves.toBeTruthy();
  });

  it("tidak bisa pinjam judul yang sama dua kali & stok dihormati", async () => {
    const { u, b } = await mk();
    const u2 = await prisma.user.create({ data: { name: "Udin", phone: "6282222222222", passwordHash: "x" } });
    await borrowBook(u.id, b.id);
    await expect(borrowBook(u.id, b.id)).rejects.toMatchObject({ code: "ALREADY" });
    await expect(borrowBook(u2.id, b.id)).rejects.toMatchObject({ code: "NO_STOCK" });
    await prisma.book.update({ where: { id: b.id }, data: { stock: 2 } });
    await expect(borrowBook(u2.id, b.id)).resolves.toBeTruthy();
  });

  it("request paralel tidak bisa menembus batas 2 buku", async () => {
    const { u } = await mk();
    const books = await Promise.all([1, 2, 3, 4, 5].map((i) => prisma.book.create({ data: { title: `B${i}`, author: "A" } })));
    const res = await Promise.allSettled(books.map((b) => borrowBook(u.id, b.id)));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await prisma.loan.count({ where: { userId: u.id, returnedAt: null } })).toBe(2);
  });

  it("status terlambat", async () => {
    const { u, b } = await mk();
    const loan = await borrowBook(u.id, b.id, wib("2026-11-16", "09:00")); // tempo Kamis 19
    expect(effectiveStatus(loan, wib("2026-11-19", "23:00"))).toBe("DIPINJAM");
    expect(effectiveStatus(loan, wib("2026-11-20", "00:30"))).toBe("TERLAMBAT");
    const r = await runReminderJob({ now: wib("2026-11-20", "07:00"), send: async () => {} });
    expect(r.markedLate).toBe(1);
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } })).status).toBe("TERLAMBAT");
    const done = await returnLoan(loan.id, "ADMIN");
    expect(effectiveStatus(done)).toBe("DIKEMBALIKAN");
    await expect(returnLoan(loan.id, "ADMIN")).rejects.toBeInstanceOf(AppError);
  });
});

describe("pengingat WA (WAHA palsu)", () => {
  it("pertama bermuatan link, lanjutan polos tanpa link, tanpa dobel, Ahad dilewati, berhenti saat dikembalikan", async () => {
    const { u, b } = await mk();
    const loan = await borrowBook(u.id, b.id, wib("2026-11-16", "09:00")); // tempo Kamis 2026-11-19
    const job = (day: string, hhmm: string) => runReminderJob({ now: wib(day, hhmm) });

    // sebelum hari tempo & sebelum jam 08.00: tidak ada kiriman
    expect((await job("2026-11-18", "09:00")).sent).toBe(0);
    expect((await job("2026-11-19", "07:59")).skipped).toMatch(/belum jam/);
    expect(waha.calls).toHaveLength(0);

    // hari tempo 08.30: pesan pertama + link
    expect((await job("2026-11-19", "08:30")).sent).toBe(1);
    expect(waha.calls).toHaveLength(1);
    const first = waha.calls[0];
    expect(first.headers["x-api-key"]).toBe("testkey");
    expect(first.body.session).toBe("default");
    expect(first.body.chatId).toBe("6281111111111@c.us");
    const m = first.body.text.match(/http:\/\/localhost:3101\/kembali\/(\S+)/);
    expect(m).not.toBeNull();
    expect(verifyReturnToken(m![1])).toMatchObject({ loanId: loan.id });
    expect(first.body.text).toContain("Atomic Habits");

    // jalan lagi di hari yang sama (tick 5 menit): tidak dobel
    expect((await job("2026-11-19", "08:35")).sent).toBe(0);
    expect((await job("2026-11-19", "15:00")).alreadyDone).toBe(1);
    expect(waha.calls).toHaveLength(1);

    // Jumat: teks polos, TANPA link
    expect((await job("2026-11-20", "08:30")).sent).toBe(1);
    expect(waha.calls[1].body.text).not.toMatch(/https?:|\/kembali|www\./i);
    expect(waha.calls[1].body.text).toContain("lewat jatuh tempo 1 hari");
    // Sabtu: polos lagi
    expect((await job("2026-11-21", "08:30")).sent).toBe(1);
    expect(waha.calls[2].body.text).not.toMatch(/https?:|\/kembali/i);
    // Ahad: dilewati
    expect((await job("2026-11-22", "09:00")).skipped).toBe("hari Ahad");
    expect(waha.calls).toHaveLength(3);
    // Senin: lanjut polos
    expect((await job("2026-11-23", "08:30")).sent).toBe(1);
    expect(waha.calls[3].body.text).toContain("lewat jatuh tempo 4 hari");
    expect(waha.calls[3].body.text).not.toMatch(/https?:|\/kembali/i);

    // log: tepat 1 FIRST_LINK + 3 FOLLOW_UP, 1 per hari
    const logs = await prisma.reminderLog.findMany({ where: { loanId: loan.id }, orderBy: { sentOn: "asc" } });
    expect(logs.map((l) => l.kind)).toEqual(["FIRST_LINK", "FOLLOW_UP", "FOLLOW_UP", "FOLLOW_UP"]);
    expect(logs.every((l) => l.status === "SENT")).toBe(true);
    expect(logs[0].message).not.toContain("/kembali/"); // token tidak disimpan di log

    // dikembalikan -> berhenti
    await returnLoan(loan.id, "ADMIN");
    expect((await job("2026-11-24", "08:30")).sent).toBe(0);
    expect(waha.calls).toHaveLength(4);
  });

  it("pinjam lagi = pola mulai ulang (pesan pertama bertaut link lagi)", async () => {
    const { u, b } = await mk();
    const l1 = await borrowBook(u.id, b.id, wib("2026-11-16", "09:00"));
    await runReminderJob({ now: wib("2026-11-19", "08:30") });
    await runReminderJob({ now: wib("2026-11-20", "08:30") });
    await returnLoan(l1.id, "USER", wib("2026-11-20", "12:00"));
    waha.calls.length = 0;
    const l2 = await borrowBook(u.id, b.id, wib("2026-11-24", "10:00")); // Selasa -> Jumat 27
    expect(keyFromDbDate(l2.dueDate)).toBe("2026-11-27");
    await runReminderJob({ now: wib("2026-11-26", "09:00") });
    expect(waha.calls).toHaveLength(0);
    await runReminderJob({ now: wib("2026-11-27", "08:30") });
    expect(waha.calls).toHaveLength(1);
    expect(waha.calls[0].body.text).toMatch(/\/kembali\//);
    await runReminderJob({ now: wib("2026-11-28", "08:30") });
    expect(waha.calls[1].body.text).not.toMatch(/\/kembali|https?:/);
  });

  it("gagal kirim dicatat & dicoba ulang (maks 3x/hari), lalu tidak dobel", async () => {
    const { u, b } = await mk();
    await borrowBook(u.id, b.id, wib("2026-11-16", "09:00"));
    waha.state.failNext = 2;
    const day = "2026-11-19";
    expect(await runReminderJob({ now: wib(day, "08:00") })).toMatchObject({ sent: 0, failed: 1 });
    expect(await runReminderJob({ now: wib(day, "08:05") })).toMatchObject({ sent: 0, failed: 1 });
    expect(await runReminderJob({ now: wib(day, "08:10") })).toMatchObject({ sent: 1, failed: 0 });
    expect(waha.calls).toHaveLength(1);
    expect(waha.calls[0].body.text).toMatch(/\/kembali\//); // tetap pesan pertama dengan link
    expect(await runReminderJob({ now: wib(day, "08:15") })).toMatchObject({ sent: 0 });
    const log = await prisma.reminderLog.findFirstOrThrow();
    expect(log.status).toBe("SENT");
    expect(log.attempts).toBe(3);
  });

  it("dua job bersamaan tidak mengirim dobel", async () => {
    const { u, b } = await mk();
    await borrowBook(u.id, b.id, wib("2026-11-16", "09:00"));
    // job() memakai lock in-process; simulasikan proses lain dengan klaim baris DB langsung
    const loan = await prisma.loan.findFirstOrThrow();
    await prisma.reminderLog.create({ data: { loanId: loan.id, sentOn: "2026-11-19", kind: "FIRST_LINK", status: "PENDING", attempts: 1, updatedAt: wib("2026-11-19", "08:29") } });
    const r = await runReminderJob({ now: wib("2026-11-19", "08:30") });
    expect(r.sent).toBe(0);
    expect(waha.calls).toHaveLength(0);
    // klaim yang macet > 15 menit boleh diambil alih
    await prisma.reminderLog.updateMany({ data: { updatedAt: wib("2026-11-19", "08:00") } });
    expect((await runReminderJob({ now: wib("2026-11-19", "08:30") })).sent).toBe(1);
    expect(waha.calls).toHaveLength(1);
    // dua job paralel dalam satu proses: hanya satu yang jalan
    const loan2 = await borrowBook(u.id, (await prisma.book.create({ data: { title: "Z", author: "Z" } })).id, wib("2026-11-16", "09:00"));
    const [x, y] = await Promise.all([runReminderJob({ now: wib("2026-11-19", "09:00") }), runReminderJob({ now: wib("2026-11-19", "09:00") })]);
    expect(x.sent + y.sent).toBe(1);
    expect(waha.calls).toHaveLength(2);
    expect(await prisma.reminderLog.count({ where: { loanId: loan2.id } })).toBe(1);
  });

  it("jeda acak antar kirim dipanggil (tidak sebelum kiriman pertama)", async () => {
    const { u } = await mk();
    const books = await Promise.all([1, 2].map((i) => prisma.book.create({ data: { title: `X${i}`, author: "A" } })));
    for (const b of books) await borrowBook(u.id, b.id, wib("2026-11-16", "09:00"));
    const sleeps: number[] = [];
    const r = await runReminderJob({ now: wib("2026-11-19", "08:30"), delayMs: () => 4321, sleep: async (ms) => void sleeps.push(ms) });
    expect(r.sent).toBe(2);
    expect(sleeps).toEqual([4321]);
  });
});

describe("dashboard", () => {
  it("angka per orang, per buku, dan ranking", async () => {
    const mkU = (n: string, p: string) => prisma.user.create({ data: { name: n, phone: p, passwordHash: "x" } });
    const [a, b, c] = await Promise.all([mkU("Ana", "6281000000001"), mkU("Budi", "6281000000002"), mkU("Cici", "6281000000003")]);
    const bk = await Promise.all(["B1", "B2", "B3"].map((t) => prisma.book.create({ data: { title: t, author: "X", stock: 2 } })));
    const t0 = wib("2026-11-16", "09:00");
    // Ana: selesai B1 & B2, sedang B3. Budi: selesai B1 (dua kali pinjam B1 = tetap 1 judul). Cici: sedang B3.
    for (const book of [bk[0], bk[1]]) await returnLoan((await borrowBook(a.id, book.id, t0)).id, "USER", t0);
    await returnLoan((await borrowBook(b.id, bk[0].id, t0)).id, "USER", t0);
    await returnLoan((await borrowBook(b.id, bk[0].id, t0)).id, "ADMIN", t0);
    await borrowBook(a.id, bk[2].id, t0);
    await borrowBook(c.id, bk[2].id, t0);

    const d = await getDashboard(wib("2026-11-25", "09:00"));
    expect(d.totals).toMatchObject({ books: 3, copies: 6, members: 3, reading: 2, late: 2, finished: 4 });
    expect(d.ranking.map((r) => [r.name, r.finishedCount, r.rank])).toEqual([["Ana", 2, 1], ["Budi", 1, 2]]);
    const ana = d.perUser.find((u) => u.name === "Ana")!;
    expect(ana.finished.map((x) => x.title).sort()).toEqual(["B1", "B2"]);
    expect(ana.reading.map((x) => x.title)).toEqual(["B3"]);
    expect(ana.reading[0].status).toBe("TERLAMBAT");
    const b1 = d.perBook.find((x) => x.title === "B1")!;
    expect(b1.readers.map((r) => r.name).sort()).toEqual(["Ana", "Budi"]);
    const b3 = d.perBook.find((x) => x.title === "B3")!;
    expect(b3.readingNow.map((r) => r.name).sort()).toEqual(["Ana", "Cici"]);
    expect(b3.available).toBe(0);
    expect(d.perUser.find((u) => u.name === "Cici")!.finishedCount).toBe(0);
  });
});
