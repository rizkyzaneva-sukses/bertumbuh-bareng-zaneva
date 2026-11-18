import { prisma } from "@/lib/db";
import { AppError, returnLoan } from "@/lib/loans";
import { verifyReturnToken } from "@/lib/tokens";
import { handler, json } from "@/lib/http";

// Publik (tanpa login): sah selama token bertanda tangan benar, belum kedaluwarsa, dan nonce di DB masih cocok.
export const POST = handler<{ token: string }>({ auth: false }, async (_req, { params }) => {
  const data = verifyReturnToken(params.token);
  if (!data) throw new AppError("BAD_TOKEN", "Link tidak valid atau sudah kedaluwarsa.", 400);
  const loan = await prisma.loan.findUnique({ where: { id: data.loanId }, include: { book: true } });
  if (!loan || loan.returnedAt || loan.returnNonce !== data.nonce)
    throw new AppError("USED_TOKEN", "Link ini sudah dipakai atau bukunya sudah dikembalikan.", 410);
  await returnLoan(loan.id, "LINK");
  return json({ ok: true, title: loan.book.title });
});
