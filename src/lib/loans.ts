import { prisma } from "./db";
import { computeDueDate, dateFromKey, jakartaKey, keyFromDbDate } from "./dates";
import { getLoanWorkingDays } from "./settings";
import { makeReturnToken, newNonce } from "./tokens";
import { stockLoss, type Condition } from "./conditions";
import { queueAfterReturnPrompt } from "./wa-prompts";
import { AppError } from "./errors";
import { MAX_ACTIVE_LOANS, effectiveStatus } from "./loan-status";
import type { ReturnedVia } from "../generated/prisma/client";

export { AppError } from "./errors";
export { MAX_ACTIVE_LOANS, effectiveStatus } from "./loan-status";

export async function borrowBook(userId: string, bookId: string, now = new Date()) {
  // Dibaca SEBELUM transaksi: aturan pinjam bisa diubah admin kapan saja, dan
  // query Setting di dalam transaksi panjang hanya menahan lock lebih lama.
  const loanDays = await getLoanWorkingDays();
  return prisma.$transaction(async (tx) => {
    // kunci baris user & buku supaya batas 2 buku dan stok aman dari balapan request
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Book" WHERE id = ${bookId} FOR UPDATE`;
    const book = await tx.book.findUnique({ where: { id: bookId } });
    if (!book) throw new AppError("BOOK_NOT_FOUND", "Buku tidak ditemukan", 404);
    const active = await tx.loan.findMany({ where: { userId, returnedAt: null }, select: { bookId: true } });
    if (active.length >= MAX_ACTIVE_LOANS)
      throw new AppError("LIMIT", `Maksimal ${MAX_ACTIVE_LOANS} buku dalam satu waktu. Balikin dulu salah satu ya.`, 409);
    if (active.some((l) => l.bookId === bookId))
      throw new AppError("ALREADY", "Kamu sedang meminjam buku ini.", 409);
    const taken = await tx.loan.count({ where: { bookId, returnedAt: null } });
    if (taken >= book.stock) throw new AppError("NO_STOCK", "Semua eksemplar buku ini sedang dipinjam.", 409);
    const due = computeDueDate(jakartaKey(now), loanDays);
    return tx.loan.create({
      data: { userId, bookId, borrowedAt: now, dueDate: dateFromKey(due), status: "DIPINJAM" },
      include: { book: true },
    });
  });
}

export async function returnLoan(
  loanId: string,
  via: ReturnedVia,
  now = new Date(),
  condition: Condition = "BAIK",
  note?: string | null,
) {
  // updateMany bersyarat = atomik; hanya satu request yang menang
  const res = await prisma.loan.updateMany({
    where: { id: loanId, returnedAt: null },
    data: {
      returnedAt: now,
      returnedVia: via,
      status: "DIKEMBALIKAN",
      returnNonce: null,
      condition,
      conditionNote: note?.trim() ? note.trim().slice(0, 300) : null,
    },
  });
  if (res.count === 0) {
    const l = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!l) throw new AppError("NOT_FOUND", "Peminjaman tidak ditemukan", 404);
    throw new AppError("ALREADY_RETURNED", "Buku ini sudah dikembalikan.", 409);
  }
  // Buku hilang = stok berkurang 1, supaya tidak terus dihitung tersedia.
  const loss = stockLoss(condition);
  if (loss > 0) {
    const loan = await prisma.loan.findUnique({ where: { id: loanId }, select: { bookId: true } });
    if (loan) {
      await prisma.book.updateMany({
        where: { id: loan.bookId, stock: { gte: loss } },
        data: { stock: { decrement: loss } },
      });
    }
  }
  const done = await prisma.loan.findUniqueOrThrow({ where: { id: loanId }, include: { book: true, user: true } });

  // Tanya "beres bacanya?" lewat WA. Diantre dulu (bukan dikirim langsung)
  // supaya request balikin tidak menunggu WAHA — scheduler yang mengirim.
  // Buku HILANG tetap ditanya: yang hilang eksemplarnya, bukan bacaan orangnya.
  await queueAfterReturnPrompt(done.userId, done.bookId, done.id).catch((e) =>
    console.error("[wa-prompt] gagal antre:", String((e as Error).message ?? e)),
  );

  return done;
}

/** Buat link pengembalian sekali pakai untuk sebuah peminjaman (nonce baru membatalkan link lama). */
export async function issueReturnToken(loanId: string, now = new Date()) {
  const nonce = newNonce();
  await prisma.loan.update({ where: { id: loanId }, data: { returnNonce: nonce } });
  return makeReturnToken(loanId, nonce, now.getTime() + 60 * 86400000);
}
