import { prisma } from "./db";
import { AppError } from "./errors";
import { MAX_ACTIVE_LOANS, effectiveStatus } from "./loan-status";
import { addDays, dateFromKey, jakartaKey, keyFromDbDate, computeDueDate } from "./dates";
import { getLoanWorkingDays } from "./settings";
import { displayPhone } from "./phone";
import type { ReadingStatus } from "../generated/prisma/client";
import type { PrismaClient, Prisma } from "../generated/prisma/client";

/** Berapa kali satu pinjaman boleh diperpanjang. */
export const RENEW_LIMIT = 2;

export type ProgressView = {
  bookId: string;
  lastPage: number;
  totalPages: number | null;
  percent: number;
  status: ReadingStatus;
  finishedAt: Date | null;
};

const pct = (last: number, total: number | null) =>
  total && total > 0 ? Math.max(0, Math.min(100, Math.round((last / total) * 100))) : 0;

export function toProgressView(p: {
  bookId: string;
  lastPage: number;
  totalPages: number | null;
  status: ReadingStatus;
  finishedAt: Date | null;
}): ProgressView {
  return { ...p, percent: pct(p.lastPage, p.totalPages) };
}

/** Semua progres bacaan satu orang, diindeks per bookId. */
export async function progressMap(userId: string) {
  const rows = await prisma.readingProgress.findMany({ where: { userId } });
  const map = new Map<string, ProgressView>();
  for (const r of rows) map.set(r.bookId, toProgressView(r));
  return map;
}

/**
 * Hasil pencatatan log harian.
 *
 * `added` = halaman yang BENAR-BENAR dibaca hari ini untuk satu (orang, buku).
 * Rumus: `after` − `before`. Kalau orang memperbaiki angkanya ke bawah (mis.
 * salah ketik 150 padahal baru 15), delta negatif — sengaja dicatat 0, karena
 * "membetulkan angka" bukan "membaca 135 halaman mundur". Total halaman harian
 * jadi tidak pernah negatif.
 */
export type ReadingLogDelta = {
  /** Halaman yang ditambahkan ke log hari ini. */
  added: number;
  /** Posisi sebelum update (0 kalau belum pernah mencatat). */
  before: number;
  /** Posisi sesudah update. */
  after: number;
};

/**
 * Catat kemajuan bacaan ke log HARIAN.
 *
 * Dipanggil dari `saveProgress` setiap kali halaman berubah, jadi anggota TIDAK
 * perlu mengetik apa pun tambahan — cukup isi "halaman terakhir" seperti
 * biasanya. Satu baris per (orang, buku, tanggal); dibaca berkali-kali dalam
 * satu hari akan MENUMLAH delta-nya, bukan menimpa.
 *
 * Contoh: Budi isi 20 → log 20 halaman. Siang isi 45 → log jadi 45 (20+25).
 * Bukan 45+45, dan bukan cuma 25 — total hari itu memang 45 halaman.
 */
export async function recordReading(
  userId: string,
  bookId: string,
  before: number,
  after: number,
  now = new Date(),
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<ReadingLogDelta> {
  // Posisi halaman tidak pernah turun, jadi delta negatif = orangnya
  // membetulkan angka. Itu bukan "membaca mundur"; catat 0.
  const added = Math.max(0, after - before);
  // Tidak ada kemajuan (angka sama / dikoreksi turun) = jangan sentuh log.
  // Kalau orang baru pertama kali mencatat dan langsung isi halaman 0, juga
  // tidak perlu baris kosong di database.
  if (added <= 0 && after === 0) return { added: 0, before, after };

  const dayKey = jakartaKey(now);
  await client.readingLog.upsert({
    where: { userId_bookId_dayKey: { userId, bookId, dayKey } },
    create: { userId, bookId, dayKey, pagesRead: added, lastPage: after },
    update: {
      pagesRead: { increment: added },
      // `lastPage` di log = posisi TERBARU hari itu, bukan penjumlahan.
      lastPage: after,
    },
  });
  return { added, before, after };
}

 /**
  * Rekap baca HARI INI untuk seluruh karyawan — inilah yang tampil di dashboard
  * admin sebagai jawaban "si A hari ini baca berapa halaman dan bukunya apa".
  *
  * Semua anggota ikut muncul, termasuk yang 0 halaman: justru itu intinya, Bos
  * mau lihat siapa yang belum baca. `status` tiga warna:
  * - `SUDAH`    : ada halaman tercatat hari ini
  * - `BELUM`    : belum ada catatan sama sekali hari ini
  */
 export type TodayReader = {
   userId: string;
   name: string;
   phone: string;
   totalPages: number;
   books: { bookId: string; title: string; author: string; pagesRead: number; lastPage: number; totalPages: number | null }[];
   status: "SUDAH" | "BELUM";
 };

 export async function getTodayReading(now = new Date()) {
   const dayKey = jakartaKey(now);
   const [users, logs] = await Promise.all([
     prisma.user.findMany({ select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
     prisma.readingLog.findMany({
       where: { dayKey },
       include: { book: { select: { id: true, title: true, author: true, pages: true } } },
       orderBy: { pagesRead: "desc" },
     }),
   ]);

   const byUser = new Map<string, TodayReader>();
   for (const u of users) {
     byUser.set(u.id, {
       userId: u.id,
       name: u.name.trim() || displayPhone(u.phone),
       phone: u.phone,
       totalPages: 0,
       books: [],
       status: "BELUM",
     });
   }
   for (const l of logs) {
     const row = byUser.get(l.userId);
     if (!row) continue; // log milik user yang sudah dihapus
     row.books.push({
       bookId: l.bookId,
       title: l.book.title,
       author: l.book.author,
       pagesRead: l.pagesRead,
       lastPage: l.lastPage,
       totalPages: l.book.pages,
     });
     row.totalPages += l.pagesRead;
     if (l.pagesRead > 0) row.status = "SUDAH";
   }

   const readers = [...byUser.values()].sort((a, b) => {
     // Yang sudah baca di atas, lalu halaman terbanyak, lalu nama A-Z.
     if (a.status !== b.status) return a.status === "SUDAH" ? -1 : 1;
     if (b.totalPages !== a.totalPages) return b.totalPages - a.totalPages;
     return a.name.localeCompare(b.name);
   });

   return {
     dayKey,
     readers,
     sudah: readers.filter((r) => r.status === "SUDAH").length,
     belum: readers.filter((r) => r.status === "BELUM").length,
     totalHalaman: readers.reduce((s, r) => s + r.totalPages, 0),
   };
 }

 /**
  * Riwayat harian satu orang untuk N hari terakhir (default 7) — dipakai di
  * halaman detail supaya admin bisa lihat pola "rajin di awal minggu, hilang
  * di akhir minggu".
  */
 export async function getReadingHistory(userId: string, days = 7, now = new Date()) {
   const today = jakartaKey(now);
   const keys: string[] = [];
   for (let i = days - 1; i >= 0; i--) keys.push(addDays(today, -i));
   const logs = await prisma.readingLog.findMany({
     where: { userId, dayKey: { in: keys } },
     include: { book: { select: { title: true, author: true } } },
   });
   return keys.map((key) => {
     const rows = logs.filter((l) => l.dayKey === key);
     return {
       dayKey: key,
       pages: rows.reduce((s, r) => s + r.pagesRead, 0),
       books: rows.map((r) => ({ title: r.book.title, pagesRead: r.pagesRead })),
     };
   });
 }

 /**
  * Simpan halaman terakhir yang dibaca.
  *
  * `lastPage` di-clamp ke 0..totalHalaman supaya angka salah ketik (mis. 9999)
  * tidak membuat progres mustahil. Kalau halaman terakhir == total halaman,
  * otomatis dianggap SELESAI — supaya orang tidak perlu klik dua kali.
  *
  * Setiap panggilan juga mencatat SELISIH halaman ke log harian. Bos: karyawan
  * cukup mencatat "hari ini sampai halaman sekian", besok "sampai halaman
  * sekian" — sistem yang menghitung sendiri berapa halaman yang dibaca hari itu.
  * Jadi tidak ada input ganda: satu angka, dua kegunaan (posisi + rekap harian).
  */
 export async function saveProgress(userId: string, bookId: string, lastPage: number, now = new Date()) {
   const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true, pages: true } });
   if (!book) throw new AppError("BOOK_NOT_FOUND", "Buku tidak ditemukan", 404);

   const total = book.pages ?? null;
   const page = Number.isFinite(lastPage) ? Math.max(0, Math.trunc(lastPage)) : 0;
   const clamped = total ? Math.min(page, total) : page;
   const done = total ? clamped >= total : false;

   // Posisi SEBELUM diupdate — dasar hitung delta harian. Dibaca di dalam
   // transaksi yang sama supaya dua tab yang mencatat bersamaan tidak
   // menghasilkan delta dobel.
   const saved = await prisma.$transaction(async (tx) => {
     const before = await tx.readingProgress.findUnique({
       where: { userId_bookId: { userId, bookId } },
       select: { lastPage: true },
     });

     const row = await tx.readingProgress.upsert({
       where: { userId_bookId: { userId, bookId } },
       create: {
         userId,
         bookId,
         lastPage: clamped,
         totalPages: total,
         status: done ? "SELESAI" : "SEDANG_DIBACA",
         finishedAt: done ? now : null,
       },
       update: {
         lastPage: clamped,
         totalPages: total,
         // Jangan turunkan status yang sudah SELESAI jadi SEDANG_DIBACA hanya
         // karena orangnya memperbaiki angka halaman.
         ...(done ? { status: "SELESAI" as const, finishedAt: now } : {}),
       },
     });

     const delta = await recordReading(userId, bookId, before?.lastPage ?? 0, clamped, now, tx);
     return { row, delta };
   });

   return saved.row;
 }

/** Tandai beres baca (atau batalkan kalau `done = false`). */
export async function markFinished(userId: string, bookId: string, done = true, now = new Date()) {
  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true, pages: true } });
  if (!book) throw new AppError("BOOK_NOT_FOUND", "Buku tidak ditemukan", 404);
  return prisma.readingProgress.upsert({
    where: { userId_bookId: { userId, bookId } },
    create: {
      userId,
      bookId,
      lastPage: done && book.pages ? book.pages : 0,
      totalPages: book.pages ?? null,
      status: done ? "SELESAI" : "SEDANG_DIBACA",
      finishedAt: done ? now : null,
    },
    update: done
      ? {
          status: "SELESAI",
          finishedAt: now,
          ...(book.pages ? { lastPage: book.pages } : {}),
        }
      : { status: "SEDANG_DIBACA", finishedAt: null },
  });
}

/**
 * Perpanjang masa pinjam.
 *
 * Aturan yang dipilih Bos: **tidak perlu mengembalikan buku dulu**. Selama
 * batas perpanjangan belum habis dan bukunya tidak diantre orang lain,
 * jatuh tempo digeser. Kalau ada yang mengantre, perpanjangan ditolak —
 * adil untuk yang menunggu, dan pesannya menjelaskan jalan keluarnya.
 *
 * Satu perpanjangan = tambah sebanyak lama pinjam yang sedang berlaku
 * (setting admin), bukan angka tetap — supaya kalau kebijakan berubah jadi
 * 7 hari, perpanjangan pun ikut 7 hari.
 */
export async function renewLoan(loanId: string, userId: string, now = new Date()) {
  const renewDays = await getLoanWorkingDays();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Loan" WHERE id = ${loanId} FOR UPDATE`;
    const loan = await tx.loan.findUnique({ where: { id: loanId }, include: { book: true } });
    if (!loan) throw new AppError("NOT_FOUND", "Peminjaman tidak ditemukan", 404);
    if (loan.userId !== userId) throw new AppError("FORBIDDEN", "Ini bukan pinjamanmu", 403);
    if (loan.returnedAt) throw new AppError("ALREADY_RETURNED", "Buku ini sudah dikembalikan.", 409);
    if (loan.renewCount >= RENEW_LIMIT)
      throw new AppError(
        "RENEW_LIMIT",
        `Sudah ${RENEW_LIMIT}× diperpanjang. Balikin dulu ya, nanti bisa pinjam lagi.`,
        409,
      );

    // Antrean: siapa pun yang menunggu buku ini (pinjaman aktif orang lain).
    const waiting = await tx.loan.count({ where: { bookId: loan.bookId, returnedAt: null, id: { not: loan.id } } });
    if (waiting >= loan.book.stock)
      throw new AppError(
        "ON_HOLD",
        "Buku ini sedang diantre orang lain, jadi tidak bisa diperpanjang. Balikin dulu ya.",
        409,
      );

    // Geser dari jatuh tempo LAMA (bukan dari hari ini) supaya perpanjangan
    // yang dilakukan lebih awal tidak menghanguskan sisa harinya.
    const oldDue = keyFromDbDate(loan.dueDate);
    const from = oldDue > jakartaKey(now) ? oldDue : jakartaKey(now);
    const newDue = computeDueDate(from, renewDays);
    const updated = await tx.loan.update({
      where: { id: loan.id },
      data: { dueDate: dateFromKey(newDue), renewCount: { increment: 1 }, status: "DIPINJAM" },
      include: { book: true },
    });
    return { loan: updated, oldDue, newDue, remaining: RENEW_LIMIT - updated.renewCount };
  });
}

export type MyBook = {
  loanId: string;
  bookId: string;
  title: string;
  author: string;
  pages: number | null;
  dueKey: string;
  status: ReturnType<typeof effectiveStatus>;
  renewCount: number;
  renewLeft: number;
  canRenew: boolean;
  progress: ProgressView | null;
};

/**
 * Riwayat bacaan satu orang: buku yang sedang dipinjam + yang pernah selesai.
 *
 * Dikelompokkan per BUKU (bukan per transaksi) supaya "Buku A dipinjam 3×"
 * tetap satu baris dengan progres terakhir — itulah yang dipakai untuk
 * melanjutkan bacaan.
 */
export async function myHistory(userId: string, now = new Date()) {
  const [loans, progresses] = await Promise.all([
    prisma.loan.findMany({
      where: { userId },
      include: { book: true },
      orderBy: { borrowedAt: "desc" },
    }),
    prisma.readingProgress.findMany({ where: { userId } }),
  ]);
  const prog = new Map(progresses.map((p) => [p.bookId, toProgressView(p)]));

  const active = loans.filter((l) => !l.returnedAt);
  const activeBookIds = new Set(active.map((l) => l.bookId));

  const reading: MyBook[] = active.map((l) => ({
    loanId: l.id,
    bookId: l.bookId,
    title: l.book.title,
    author: l.book.author,
    pages: l.book.pages,
    dueKey: keyFromDbDate(l.dueDate),
    status: effectiveStatus(l, now),
    renewCount: l.renewCount,
    renewLeft: Math.max(0, RENEW_LIMIT - l.renewCount),
    canRenew: l.renewCount < RENEW_LIMIT,
    progress: prog.get(l.bookId) ?? null,
  }));

  // Buku yang pernah dibaca selesai: gabungkan per bookId, ambil yang terakhir.
  // `lastLoanId` penting: bukti pengembalian menempel ke PEMINJAMAN, sedangkan
  // daftar ini dikelompokkan per BUKU. Tanpa ini UI tidak tahu bukti mana yang
  // dibuka saat buku yang sama pernah dipinjam berkali-kali.
  const finishedMap = new Map<
    string,
    { bookId: string; title: string; author: string; pages: number | null; lastReturnedAt: Date | null; lastLoanId: string; times: number }
  >();
  for (const l of loans) {
    if (l.returnedAt) {
      const cur = finishedMap.get(l.bookId);
      if (!cur) {
        finishedMap.set(l.bookId, {
          bookId: l.bookId,
          title: l.book.title,
          author: l.book.author,
          pages: l.book.pages,
          lastReturnedAt: l.returnedAt,
          lastLoanId: l.id,
          times: 1,
        });
      } else if (cur.lastReturnedAt && l.returnedAt > cur.lastReturnedAt) {
        cur.lastReturnedAt = l.returnedAt;
        cur.lastLoanId = l.id;
        cur.times += 1;
      } else {
        cur.times += 1;
      }
    }
  }

  const returned = [...finishedMap.values()]
    .filter((b) => !activeBookIds.has(b.bookId))
    .map((b) => ({ ...b, progress: prog.get(b.bookId) ?? null }))
    .sort((a, b) => (b.lastReturnedAt?.getTime() ?? 0) - (a.lastReturnedAt?.getTime() ?? 0));

  return { reading, returned, slots: MAX_ACTIVE_LOANS };
}

/** Buku yang sedang dipinjam ORANG LAIN (untuk tahu apakah boleh diperpanjang). */
export async function otherBorrowers(bookIds: string[], userId: string) {
  if (bookIds.length === 0) return new Map<string, number>();
  const rows = await prisma.loan.groupBy({
    by: ["bookId"],
    where: { bookId: { in: bookIds }, returnedAt: null, userId: { not: userId } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.bookId, r._count._all]));
}

/** Daftar tanggal untuk menampilkan "N hari lagi" tanpa math tanggal di UI. */
export const daysFromToday = (key: string, todayKey = jakartaKey(new Date())) => {
  const diff = Math.round(
    (new Date(key + "T00:00:00Z").getTime() - new Date(todayKey + "T00:00:00Z").getTime()) / 86400000,
  );
  return diff;
};

export { addDays };
