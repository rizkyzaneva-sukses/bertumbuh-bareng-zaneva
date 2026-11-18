import { prisma } from "@/lib/db";
import { AdminBooks } from "@/components/AdminBooks";

export const metadata = { title: "Admin · Buku" };

export default async function AdminBuku() {
  const [books, active] = await Promise.all([
    prisma.book.findMany({ orderBy: { title: "asc" } }),
    prisma.loan.groupBy({ by: ["bookId"], where: { returnedAt: null }, _count: true }),
  ]);
  const a = new Map(active.map((x) => [x.bookId, x._count]));
  return <AdminBooks books={books.map((b) => ({ id: b.id, title: b.title, author: b.author, pages: b.pages, category: b.category, synopsis: b.synopsis, stock: b.stock, active: a.get(b.id) ?? 0 }))} />;
}
