import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError, returnLoan } from "@/lib/loans";
import { isCondition } from "@/lib/conditions";
import { handler, json } from "@/lib/http";

const Body = z.object({
  condition: z.string().optional(),
  note: z.string().max(300).optional(),
});

/**
 * Tandai buku kembali.
 * - Admin boleh mencatat kondisi (baik / rusak / hilang).
 * - Peminjam hanya boleh menandai "BAIK" — kalau bukunya rusak atau hilang,
 *   itu harus admin yang mencatat supaya stok tidak diubah sendiri.
 */
export const POST = handler<{ id: string }>({}, async (req, { user, params }) => {
  const loan = await prisma.loan.findUnique({ where: { id: params.id } });
  if (!loan) throw new AppError("NOT_FOUND", "Peminjaman tidak ditemukan", 404);

  const isAdmin = user.role === "ADMIN";
  const isOwner = loan.userId === user.id;
  if (!isOwner && !isAdmin) throw new AppError("FORBIDDEN", "Ini bukan pinjamanmu", 403);

  const { condition: rawCondition, note } = Body.parse(await req.json().catch(() => ({})));
  const condition = isCondition(rawCondition) ? rawCondition : "BAIK";

  if (!isAdmin && condition !== "BAIK")
    throw new AppError("FORBIDDEN", "Kategori rusak/hilang hanya bisa dicatat admin.", 403);

  const done = await returnLoan(loan.id, isOwner ? "USER" : "ADMIN", new Date(), condition, note);
  return json({
    ok: true,
    loan: { id: done.id, returnedAt: done.returnedAt, condition: done.condition, conditionNote: done.conditionNote },
  });
});
