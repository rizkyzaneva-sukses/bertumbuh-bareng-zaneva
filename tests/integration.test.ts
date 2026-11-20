import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { borrowBook, effectiveStatus, returnLoan, AppError } from "@/lib/loans";
import { runReminderJob, followUpText } from "@/lib/reminders";
import { verifyReturnToken } from "@/lib/tokens";
import { getDashboard } from "@/lib/stats";
import { markFinished, renewLoan, saveProgress, RENEW_LIMIT } from "@/lib/reading";
import { afterReturnText, parseAnswer, pollPromptReplies, deliverPendingPrompts } from "@/lib/wa-prompts";
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
    const bk = await Promise.all([["B1", 300], ["B2", 200], ["B3", 100]].map(([t, pg]) => prisma.book.create({ data: { title: t as string, author: "X", stock: 2, pages: pg as number } })));
    const t0 = wib("2026-11-16", "09:00");

    // Ana: selesai B1 & B2 (ditandai beres), sedang B3.
    // Budi: selesai B1 (dua kali pinjam B1 = tetap 1 judul), TAPI tidak ditandai beres.
    // Cici: sedang B3.
    for (const book of [bk[0], bk[1]]) {
      await returnLoan((await borrowBook(a.id, book.id, t0)).id, "USER", t0);
      await markFinished(a.id, book.id, true, t0);
    }
    await returnLoan((await borrowBook(b.id, bk[0].id, t0)).id, "USER", t0);
    await returnLoan((await borrowBook(b.id, bk[0].id, t0)).id, "ADMIN", t0);
    await borrowBook(a.id, bk[2].id, t0);
    await borrowBook(c.id, bk[2].id, t0);

    const d = await getDashboard(wib("2026-11-25", "09:00"));
    // "finished" = beres baca yang DITANDAI, bukan jumlah buku yang dikembalikan.
    // Ada 4 pengembalian, tapi hanya 2 yang ditandai beres.
    expect(d.totals).toMatchObject({ books: 3, copies: 6, members: 3, reading: 2, late: 2, finished: 2 });
    expect(d.totals.returnedUnfinished).toBe(1); // Budi: kembali tapi tidak ditandai
    expect(d.ranking.map((r) => [r.name, r.finishedCount, r.rank])).toEqual([["Ana", 2, 1]]);
    const ana = d.perUser.find((u) => u.name === "Ana")!;
    expect(ana.finished.map((x) => x.title).sort()).toEqual(["B1", "B2"]);
    expect(ana.reading.map((x) => x.title)).toEqual(["B3"]);
    expect(ana.reading[0].status).toBe("TERLAMBAT");
    const b1 = d.perBook.find((x) => x.title === "B1")!;
    expect(b1.readers.map((r) => r.name)).toEqual(["Ana"]); // Budi tidak ditandai beres
    const b3 = d.perBook.find((x) => x.title === "B3")!;
    expect(b3.readingNow.map((r) => r.name).sort()).toEqual(["Ana", "Cici"]);
    expect(b3.available).toBe(0);
    expect(d.perUser.find((u) => u.name === "Cici")!.finishedCount).toBe(0);
  });

  it("buku belum selesai dibaca tetap terhitung meski sudah dikembalikan", async () => {
    const u = await prisma.user.create({ data: { name: "Dewi", phone: "6281000000009", passwordHash: "x" } });
    const b = await prisma.book.create({ data: { title: "Tebal", author: "Y", pages: 400, stock: 1 } });
    const t0 = wib("2026-11-16", "09:00");
    const loan = await borrowBook(u.id, b.id, t0);

    // Baca sampai 200, lalu buku dikembalikan karena kepepet jatuh tempo.
    await saveProgress(u.id, b.id, 200, t0);
    await returnLoan(loan.id, "USER", t0);

    // Sudah tidak dipegang, tapi progres TIDAK hilang dan BELUM dianggap selesai.
    const p = await prisma.readingProgress.findUniqueOrThrow({ where: { userId_bookId: { userId: u.id, bookId: b.id } } });
    expect(p.lastPage).toBe(200);
    expect(p.status).toBe("SEDANG_DIBACA");
    expect(p.finishedAt).toBeNull();

    const d = await getDashboard(wib("2026-11-20", "09:00"));
    expect(d.totals.finished).toBe(0);
    expect(d.totals.returnedUnfinished).toBe(1);

    // Lanjut dari halaman 200 (bukan dari nol) lalu tuntaskan.
    await saveProgress(u.id, b.id, 400, t0);
    const done = await prisma.readingProgress.findUniqueOrThrow({ where: { userId_bookId: { userId: u.id, bookId: b.id } } });
    expect(done.status).toBe("SELESAI");
    expect(done.finishedAt).not.toBeNull();

    const d2 = await getDashboard(wib("2026-11-20", "09:00"));
    expect(d2.totals.finished).toBe(1);
    expect(d2.totals.returnedUnfinished).toBe(0);
    expect(d2.ranking.map((r) => [r.name, r.finishedCount])).toEqual([["Dewi", 1]]);
  });

  it("halaman di-clamp ke jumlah halaman buku (angka salah ketik tidak merusak data)", async () => {
    const u = await prisma.user.create({ data: { name: "Eka", phone: "6281000000010", passwordHash: "x" } });
    const b = await prisma.book.create({ data: { title: "Tipis", author: "Z", pages: 100, stock: 1 } });
    await saveProgress(u.id, b.id, 9999);
    const p = await prisma.readingProgress.findUniqueOrThrow({ where: { userId_bookId: { userId: u.id, bookId: b.id } } });
    expect(p.lastPage).toBe(100);
    expect(p.status).toBe("SELESAI");
  });
});

describe("perpanjangan", () => {
  it("tidak perlu mengembalikan buku dulu — jatuh tempo digeser", async () => {
    const { u, b } = await mk();
    await prisma.book.update({ where: { id: b.id }, data: { stock: 1 } });
    // Kamis 19 Nov 2026 -> jatuh tempo Senin 23 Nov (Ahad dilewati)
    const loan = await borrowBook(u.id, b.id, wib("2026-11-19", "09:00"));
    expect(keyFromDbDate(loan.dueDate)).toBe("2026-11-23");

    const r = await renewLoan(loan.id, u.id, wib("2026-11-19", "10:00"));
    // Digeser dari jatuh tempo LAMA (23 Nov) + 3 hari kerja = Kamis 26 Nov
    expect(r.newDue).toBe("2026-11-26");
    expect(r.remaining).toBe(RENEW_LIMIT - 1);

    const after = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(after.returnedAt).toBeNull(); // buku TIDAK dikembalikan
    expect(after.renewCount).toBe(1);
    expect(after.status).toBe("DIPINJAM");
  });

  it("perpanjangan dari hari ini kalau sudah lewat jatuh tempo (tidak hanguskan sisa)", async () => {
    const { u, b } = await mk();
    const loan = await borrowBook(u.id, b.id, wib("2026-11-16", "09:00")); // tempo 19 Nov
    // Diperpanjang saat sudah telat 4 hari (23 Nov) -> hitung dari HARI INI
    const r = await renewLoan(loan.id, u.id, wib("2026-11-23", "10:00"));
    expect(r.newDue).toBe("2026-11-26");
  });

  it("batas perpanjangan dihabisi lalu ditolak", async () => {
    const { u, b } = await mk();
    const loan = await borrowBook(u.id, b.id, wib("2026-11-16", "09:00"));
    await renewLoan(loan.id, u.id, wib("2026-11-16", "10:00"));
    await renewLoan(loan.id, u.id, wib("2026-11-16", "11:00"));
    await expect(renewLoan(loan.id, u.id, wib("2026-11-16", "12:00"))).rejects.toThrow(/diperpanjang/i);
    const after = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(after.renewCount).toBe(RENEW_LIMIT);
  });

  it("ditolak kalau buku sedang diantre orang lain", async () => {
    const a = await prisma.user.create({ data: { name: "A", phone: "6281200000001", passwordHash: "x" } });
    const b2 = await prisma.user.create({ data: { name: "B", phone: "6281200000002", passwordHash: "x" } });
    const book = await prisma.book.create({ data: { title: "Satu Eksemplar", author: "X", stock: 1 } });
    const loanA = await borrowBook(a.id, book.id, wib("2026-11-16", "09:00"));

    // B tidak bisa meminjam (stok habis) — inilah bentuk antreannya.
    await expect(borrowBook(b2.id, book.id, wib("2026-11-16", "10:00"))).rejects.toThrow(/eksemplar/i);

    // Tanpa antrean nyata, A boleh perpanjang.
    const ok = await renewLoan(loanA.id, a.id, wib("2026-11-16", "11:00"));
    expect(ok.loan.renewCount).toBe(1);
  });

  it("orang lain tidak bisa memperpanjang pinjaman kita", async () => {
    const { u, b } = await mk();
    const lain = await prisma.user.create({ data: { name: "Lain", phone: "6281200000003", passwordHash: "x" } });
    const loan = await borrowBook(u.id, b.id, wib("2026-11-16", "09:00"));
    await expect(renewLoan(loan.id, lain.id, wib("2026-11-16", "10:00"))).rejects.toThrow(/bukan pinjamanmu/i);
  });

  it("buku yang sudah dikembalikan tidak bisa diperpanjang", async () => {
    const { u, b } = await mk();
    const t0 = wib("2026-11-16", "09:00");
    const loan = await borrowBook(u.id, b.id, t0);
    await returnLoan(loan.id, "USER", t0);
    await expect(renewLoan(loan.id, u.id, t0)).rejects.toThrow(/sudah dikembalikan/i);
  });
});

describe("pertanyaan beres-baca via WA", () => {
  it("pengingat keterlambatan menawarkan PERPANJANG, tidak menyuruh balikin dulu", () => {
    const t = followUpText("Tia", "Atomic Habits", 2);
    expect(t).toContain("Perpanjang");
    expect(t).toContain("Tidak perlu balikin dulu");
    // Kalimat lama yang dikeluhkan Bos tidak boleh muncul lagi
    expect(t).not.toContain("Mohon segera dikembalikan ya, lalu tandai");
  });

  it("teks pertanyaannya sesuai permintaan Bos (ketik 1 / ketik 2 + halaman)", () => {
    const t = afterReturnText("Tia", "Atomic Habits", 320);
    expect(t).toContain("Beres bacanya?");
    expect(t).toContain("Ketik 1 kalau sudah beres");
    expect(t).toContain("Ketik 2 dan tuliskan halamannya");
    expect(t).toContain("2 (50)"); // contoh formatnya
    expect(t).toContain("320 halaman");
    expect(t).toContain("Atomic Habits");
  });

  it("membaca 1, 2, dan 2 (50) — tapi menolak obrolan biasa", () => {
    expect(parseAnswer("1")).toEqual({ answer: "1" });
    expect(parseAnswer("1.")).toEqual({ answer: "1" });
    expect(parseAnswer(" 2 ")).toEqual({ answer: "2" });
    expect(parseAnswer("2️⃣")).toEqual({ answer: "2" });

    // Inti permintaan Bos: "2 (50)" = belum beres, baru sampai halaman 50
    expect(parseAnswer("2 (50)")).toEqual({ answer: "2", page: 50 });
    expect(parseAnswer("2(50)")).toEqual({ answer: "2", page: 50 });
    expect(parseAnswer("2 50")).toEqual({ answer: "2", page: 50 });
    expect(parseAnswer("2 hal 50")).toEqual({ answer: "2", page: 50 });
    expect(parseAnswer("2 halaman 50")).toEqual({ answer: "2", page: 50 });

    // Harus diabaikan supaya obrolan harian tidak menandai buku selesai
    expect(parseAnswer("iya")).toBeNull();
    expect(parseAnswer("12")).toBeNull();
    expect(parseAnswer("saya baca 1 buku 2 kali")).toBeNull();
    expect(parseAnswer("")).toBeNull();
  });

  it("mengembalikan buku mengantre pertanyaan, terkirim tanpa menunggu, tidak dobel", async () => {
    const { u, b } = await mk();
    const t0 = wib("2026-11-16", "09:00");
    const loan = await borrowBook(u.id, b.id, t0);
    waha.calls.length = 0;
    await returnLoan(loan.id, "USER", t0);

    const queued = await prisma.waPrompt.findMany({ where: { loanId: loan.id } });
    expect(queued).toHaveLength(1);
    expect(queued[0].sentAt).toBeNull(); // request balikin tidak menunggu WAHA
    expect(waha.calls).toHaveLength(0);

    const sent = await deliverPendingPrompts({ now: t0 });
    expect(sent.sent).toBe(1);
    expect(waha.calls[0].body.text).toContain("Beres bacanya?");
    expect(waha.calls[0].body.chatId).toBe("6281111111111@c.us");

    // Dijalankan lagi: tidak dobel
    const again = await deliverPendingPrompts({ now: t0 });
    expect(again.sent).toBe(0);
    expect(waha.calls).toHaveLength(1);
  });

  it("balasan 1 = beres baca, dibalas konfirmasi; tidak diproses dua kali", async () => {
    const { u, b } = await mk();
    const t0 = wib("2026-11-16", "09:00");
    const loan = await borrowBook(u.id, b.id, t0);
    await returnLoan(loan.id, "USER", t0);
    await deliverPendingPrompts({ now: t0 });
    const prompt = await prisma.waPrompt.findFirstOrThrow({ where: { loanId: loan.id } });

    waha.calls.length = 0;
    const sentTs = Math.floor(prompt.sentAt!.getTime() / 1000);
    const fakeFetch = async () => [
      { id: "m1", timestamp: sentTs + 60, fromMe: false, body: "1", chatId: "6281111111111@c.us" },
    ];

    const r = await pollPromptReplies({ now: new Date((sentTs + 60) * 1000), fetchMessages: fakeFetch as never });
    expect(r.answered).toBe(1);
    expect(r.replied).toBe(1);
    expect(waha.calls[0].body.text).toContain("SELESAI dibaca");

    const p = await prisma.readingProgress.findUniqueOrThrow({ where: { userId_bookId: { userId: u.id, bookId: b.id } } });
    expect(p.status).toBe("SELESAI");
    expect(p.finishedAt).not.toBeNull();

    // Poll lagi dengan pesan lama yang sama: tidak diproses ulang
    const r2 = await pollPromptReplies({ now: new Date((sentTs + 120) * 1000), fetchMessages: fakeFetch as never });
    expect(r2.answered).toBe(0);
  });

  it("balasan 2 = belum selesai; progres tetap ada supaya bisa dilanjutkan", async () => {
    const { u, b } = await mk();
    const t0 = wib("2026-11-16", "09:00");
    const loan = await borrowBook(u.id, b.id, t0);
    await saveProgress(u.id, b.id, 42, t0);
    await returnLoan(loan.id, "USER", t0);
    await deliverPendingPrompts({ now: t0 });
    const prompt = await prisma.waPrompt.findFirstOrThrow({ where: { loanId: loan.id } });

    waha.calls.length = 0;
    const sentTs = Math.floor(prompt.sentAt!.getTime() / 1000);
    const fakeFetch = async () => [
      { id: "m2", timestamp: sentTs + 60, fromMe: false, body: "2", chatId: "6281111111111@c.us" },
    ];
    const r = await pollPromptReplies({ now: new Date((sentTs + 60) * 1000), fetchMessages: fakeFetch as never });
    expect(r.answered).toBe(1);
    expect(waha.calls[0].body.text).toContain("belum selesai");

    const p = await prisma.readingProgress.findUniqueOrThrow({ where: { userId_bookId: { userId: u.id, bookId: b.id } } });
    expect(p.status).toBe("SEDANG_DIBACA");
    expect(p.lastPage).toBe(42); // progres lama TIDAK dihapus/di-reset
  });

  it('balasan "2 (50)" = belum beres DAN simpan halaman 50 dalam satu pesan', async () => {
    const u = await prisma.user.create({ data: { name: "Fajar", phone: "6281300000001", passwordHash: "x" } });
    const book = await prisma.book.create({ data: { title: "Tebal 300", author: "W", pages: 300, stock: 1 } });
    const t0 = wib("2026-11-16", "09:00");
    const loan = await borrowBook(u.id, book.id, t0);
    await returnLoan(loan.id, "USER", t0);
    await deliverPendingPrompts({ now: t0 });
    const prompt = await prisma.waPrompt.findFirstOrThrow({ where: { loanId: loan.id } });
    const sentTs = Math.floor(prompt.sentAt!.getTime() / 1000);

    waha.calls.length = 0;
    const fakeFetch = async () => [
      { id: "m9", timestamp: sentTs + 60, fromMe: false, body: "2 (50)", chatId: "6281300000001@c.us" },
    ];
    const r = await pollPromptReplies({ now: new Date((sentTs + 60) * 1000), fetchMessages: fakeFetch as never });
    expect(r.answered).toBe(1);

    // Halaman tersimpan, TAPI tidak dihitung selesai → tidak masuk dashboard
    const p = await prisma.readingProgress.findUniqueOrThrow({ where: { userId_bookId: { userId: u.id, bookId: book.id } } });
    expect(p.lastPage).toBe(50);
    expect(p.totalPages).toBe(300);
    expect(p.status).toBe("SEDANG_DIBACA");
    expect(p.finishedAt).toBeNull();

    const d = await getDashboard(wib("2026-11-20", "09:00"));
    expect(d.totals.finished).toBe(0);
    expect(d.ranking).toHaveLength(0);

    // Balasannya menyebut halaman yang dilaporkan
    expect(waha.calls[0].body.text).toContain("halaman 50");
    expect(waha.calls[0].body.text).toContain("300");
  });

  it('balasan "2 (9999)" di-clamp ke jumlah halaman buku, tetap belum beres', async () => {
    const u = await prisma.user.create({ data: { name: "Gita", phone: "6281300000002", passwordHash: "x" } });
    const book = await prisma.book.create({ data: { title: "Tipis 80", author: "V", pages: 80, stock: 1 } });
    const t0 = wib("2026-11-16", "09:00");
    const loan = await borrowBook(u.id, book.id, t0);
    await returnLoan(loan.id, "USER", t0);
    await deliverPendingPrompts({ now: t0 });
    const prompt = await prisma.waPrompt.findFirstOrThrow({ where: { loanId: loan.id } });
    const sentTs = Math.floor(prompt.sentAt!.getTime() / 1000);
    const fakeFetch = async () => [
      { id: "m10", timestamp: sentTs + 60, fromMe: false, body: "2 (9999)", chatId: "6281300000002@c.us" },
    ];
    await pollPromptReplies({ now: new Date((sentTs + 60) * 1000), fetchMessages: fakeFetch as never });
    const p = await prisma.readingProgress.findUniqueOrThrow({ where: { userId_bookId: { userId: u.id, bookId: book.id } } });
    // 9999 > 80 → di-clamp ke 80, dan karena mentok halaman terakhir dianggap SELESAI
    expect(p.lastPage).toBe(80);
    expect(p.status).toBe("SELESAI");
  });

  it("pertanyaan TIDAK dikirim jam 2 pagi (ikut jendela 08.00-20.00 WIB)", async () => {
    const { u, b } = await mk();
    const t0 = wib("2026-11-16", "09:00");
    const loan = await borrowBook(u.id, b.id, t0);
    await returnLoan(loan.id, "USER", t0);
    waha.calls.length = 0;

    // Buku dikembalikan jam 02.00 dini hari: antre, tapi jangan kirim.
    const night = await deliverPendingPrompts({ now: wib("2026-11-17", "02:00") });
    expect(night.sent).toBe(0);
    expect(night.skipped).toContain("08.00");
    expect(waha.calls).toHaveLength(0);

    // Lewat jam 20.00 juga tidak.
    const late = await deliverPendingPrompts({ now: wib("2026-11-17", "21:30") });
    expect(late.sent).toBe(0);
    expect(waha.calls).toHaveLength(0);

    // Pagi berikutnya baru terkirim.
    const pagi = await deliverPendingPrompts({ now: wib("2026-11-17", "08:05") });
    expect(pagi.sent).toBe(1);
    expect(waha.calls).toHaveLength(1);
  });

  it("balasan tanpa baris WaPrompt tetap diproses (kasus nyata: kiriman manual)", async () => {
    const u = await prisma.user.create({ data: { name: "Hana", phone: "6281400000001", passwordHash: "x" } });
    const book = await prisma.book.create({ data: { title: "Buku Manual", author: "U", pages: 200, stock: 1 } });
    const t0 = wib("2026-11-16", "09:00");
    const loan = await borrowBook(u.id, book.id, t0);
    await returnLoan(loan.id, "USER", t0);
    // HAPUS baris prompt -> meniru pertanyaan yang dikirim di luar app.
    await prisma.waPrompt.deleteMany({ where: { loanId: loan.id } });
    expect(await prisma.waPrompt.count()).toBe(0);

    waha.calls.length = 0;
    const sentTs = Math.floor(t0.getTime() / 1000);
    const fakeFetch = async () => [
      // Riwayat: pertanyaan yang KITA kirim (tanpa baris DB) lalu balasan anggota.
      {
        id: "q1",
        timestamp: sentTs,
        fromMe: true,
        body: afterReturnText("Hana", "Buku Manual", 200),
        chatId: "6281400000001@c.us",
      },
      { id: "a1", timestamp: sentTs + 90, fromMe: false, body: "2(100)", chatId: "6281400000001@c.us" },
    ];

    const r = await pollPromptReplies({ now: new Date((sentTs + 90) * 1000), fetchMessages: fakeFetch as never });
    expect(r.answered).toBe(1);
    expect(r.replied).toBe(1);

    // Halaman 100 tersimpan, TIDAK dianggap selesai
    const p = await prisma.readingProgress.findUniqueOrThrow({ where: { userId_bookId: { userId: u.id, bookId: book.id } } });
    expect(p.lastPage).toBe(100);
    expect(p.status).toBe("SEDANG_DIBACA");
    expect(waha.calls[0].body.text).toContain("halaman 100");
  });

  it("pesan yang bukan 1/2 diabaikan (tidak menandai apa pun)", async () => {
    const { u, b } = await mk();
    const t0 = wib("2026-11-16", "09:00");
    const loan = await borrowBook(u.id, b.id, t0);
    await returnLoan(loan.id, "USER", t0);
    await deliverPendingPrompts({ now: t0 });
    const prompt = await prisma.waPrompt.findFirstOrThrow({ where: { loanId: loan.id } });
    const sentTs = Math.floor(prompt.sentAt!.getTime() / 1000);
    const fakeFetch = async () => [
      { id: "m3", timestamp: sentTs + 60, fromMe: false, body: "assalamualaikum", chatId: "x" },
      { id: "m4", timestamp: sentTs + 61, fromMe: true, body: "1", chatId: "x" }, // pesan KITA, bukan jawaban
    ];
    const r = await pollPromptReplies({ now: new Date((sentTs + 60) * 1000), fetchMessages: fakeFetch as never });
    expect(r.answered).toBe(0);
    const p = await prisma.readingProgress.findFirst({ where: { userId: u.id, bookId: b.id } });
    expect(p).toBeNull();
  });
});
