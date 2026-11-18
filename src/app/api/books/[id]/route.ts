import { prisma } from "@/lib/db";
import { AppError } from "@/lib/loans";
import { handler, json } from "@/lib/http";
import { BookBody } from "@/lib/schemas";

export const PATCH = handler<{ id: string }>({ admin: true }, async (req, { params }) => {
  const data = BookBody.partial().parse(await req.json());
  const book = await prisma.book.findUnique({ where: { id: params.id } });
  if (!book) throw new AppError("NOT_FOUND", "Buku tidak ditemukan", 404);
  if (data.stock !== undefined) {
    const active = await prisma.loan.count({ where: { bookId: book.id, returnedAt: null } });
    if (data.stock < active) throw new AppError("STOCK", `Stok tidak boleh di bawah jumlah yang sedang dipinjam (${active}).`, 409);
  }
  const updated = await prisma.book.update({ where: { id: params.id }, data: { ...data, pages: data.pages === undefined ? undefined : data.pages } });
  return json({ ok: true, book: updated });
});

export const DELETE = handler<{ id: string }>({ admin: true }, async (_req, { params }) => {
  const book = await prisma.book.findUnique({ where: { id: params.id } });
  if (!book) throw new AppError("NOT_FOUND", "Buku tidak ditemukan", 404);
  const active = await prisma.loan.count({ where: { bookId: book.id, returnedAt: null } });
  if (active > 0) throw new AppError("ACTIVE_LOANS", `Buku ini sedang dipinjam (${active}). Tandai dikembalikan dulu sebelum dihapus.`, 409);
  await prisma.book.delete({ where: { id: params.id } }); // riwayat baca buku ini ikut terhapus
  return json({ ok: true });
});
