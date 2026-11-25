import { prisma } from "./db";
import { AppError } from "./errors";
import { MAX_ACTIVE_LOANS, effectiveStatus } from "./loan-status";
import { addDays, dateFromKey, jakartaKey, keyFromDbDate, computeDueDate } from "./dates";
import { getLoanWorkingDays } from "./settings";
import type { ReadingStatus } from "../generated/prisma/client";

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
 * Simpan halaman terakhir yang dibaca.
 *
 * `lastPage` di-clamp ke 0..totalHalaman supaya angka salah ketik (mis. 9999)
 * tidak membuat progres mustahil. Kalau halaman terakhir == total halaman,
 * otomatis dianggap SELESAI — supaya orang tidak perlu klik dua kali.
 */
export async function saveProgress(userId: string, bookId: string, lastPage: number, now = new Date()) {
  const book = await prisma.book.findUnique({ where: { id: bookId }, select: { id: true, pages: true } });
  if (!book) throw new AppError("BOOK_NOT_FOUND", "Buku tidak ditemukan", 404);

  const total = book.pages ?? null;
  const page = Number.isFinite(lastPage) ? Math.max(0, Math.trunc(lastPage)) : 0;
  const clamped = total ? Math.min(page, total) : page;
  const done = total ? clamped >= total : false;

  return prisma.readingProgress.upsert({
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
