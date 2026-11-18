import { prisma } from "@/lib/db";
import { AppError, returnLoan } from "@/lib/loans";
import { handler, json } from "@/lib/http";

export const POST = handler<{ id: string }>({}, async (_req, { user, params }) => {
  const loan = await prisma.loan.findUnique({ where: { id: params.id } });
  if (!loan) throw new AppError("NOT_FOUND", "Peminjaman tidak ditemukan", 404);
  const isAdmin = user.role === "ADMIN";
  if (loan.userId !== user.id && !isAdmin) throw new AppError("FORBIDDEN", "Ini bukan pinjamanmu", 403);
  const done = await returnLoan(loan.id, loan.userId === user.id ? "USER" : "ADMIN");
  return json({ ok: true, loan: { id: done.id, returnedAt: done.returnedAt } });
});
