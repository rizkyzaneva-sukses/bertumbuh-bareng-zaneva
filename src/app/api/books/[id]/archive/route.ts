import { z } from "zod";
import { prisma } from "@/lib/db";
import { setArchived } from "@/lib/archive";
import { AppError } from "@/lib/loans";
import { handler, json } from "@/lib/http";

const Body = z.object({ archived: z.boolean() });

/**
 * Arsipkan / kembalikan buku ke rak.
 *
 * `POST { archived: true }`  → hilang dari rak, tidak bisa dipinjam lagi
 * `POST { archived: false }` → kembali ke rak seperti semula
 *
 * Tidak menghapus apa pun: sampul, riwayat pinjam, dan progres baca tetap utuh.
 */
export const POST = handler<{ id: string }>({ admin: true }, async (req, { params }) => {
  const { archived } = Body.parse(await req.json());
  const book = await prisma.book.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!book) throw new AppError("NOT_FOUND", "Buku tidak ditemukan", 404);
  const result = await setArchived(params.id, archived);
  return json({
    ok: true,
    ...result,
    pesan: archived
      ? result.activeLoans > 0
        ? `"${result.title}" diarsipkan. ${result.activeLoans} pinjaman yang berjalan tetap bisa dikembalikan seperti biasa.`
        : `"${result.title}" diarsipkan. Bisa dikembalikan ke rak kapan saja.`
      : `"${result.title}" kembali ke rak dan bisa dipinjam lagi.`,
  });
});
