import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MAX_ACTIVE_LOANS } from "@/lib/loans";
import { Catalog } from "@/components/Catalog";

export const metadata = { title: "Rak Buku" };

export default async function BukuPage() {
  const user = await requireUser();
  const [books, active] = await Promise.all([
    prisma.book.findMany({ orderBy: { title: "asc" } }),
    prisma.loan.findMany({ where: { returnedAt: null }, select: { bookId: true, userId: true } }),
  ]);
  const mine = new Set(active.filter((l) => l.userId === user.id).map((l) => l.bookId));
  const taken = new Map<string, number>();
  for (const l of active) taken.set(l.bookId, (taken.get(l.bookId) ?? 0) + 1);
  return (
    <>
      <h1>Rak Buku 📚</h1>
      <p className="muted">Pilih buku, pinjam 3 hari kerja (Ahad tidak dihitung). Maksimal {MAX_ACTIVE_LOANS} buku sekaligus.</p>
      <Catalog
        isAdmin={user.role === "ADMIN"}
        slotsFull={mine.size >= MAX_ACTIVE_LOANS}
        books={books.map((b) => ({
          id: b.id, title: b.title, author: b.author, pages: b.pages, category: b.category, synopsis: b.synopsis, stock: b.stock,
          available: Math.max(0, b.stock - (taken.get(b.id) ?? 0)),
          mine: mine.has(b.id),
        }))}
      />
    </>
  );
}
