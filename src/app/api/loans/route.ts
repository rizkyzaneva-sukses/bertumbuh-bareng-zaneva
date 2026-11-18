import { z } from "zod";
import { borrowBook } from "@/lib/loans";
import { keyFromDbDate } from "@/lib/dates";
import { handler, json } from "@/lib/http";

export const POST = handler({}, async (req, { user }) => {
  const { bookId } = z.object({ bookId: z.string().min(1) }).parse(await req.json());
  const loan = await borrowBook(user.id, bookId);
  return json({ ok: true, loan: { id: loan.id, bookTitle: loan.book.title, dueDate: keyFromDbDate(loan.dueDate) } }, 201);
});
