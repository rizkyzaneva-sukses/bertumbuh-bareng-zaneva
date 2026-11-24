import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MAX_ACTIVE_LOANS } from "@/lib/loans";
import { getLoanWorkingDays } from "@/lib/settings";
import { displayPhone } from "@/lib/phone";
import { Catalog } from "@/components/Catalog";

export const metadata = { title: "Rak Buku" };
export const dynamic = "force-dynamic";

export default async function BukuPage() {
  const user = await requireUser();
  const [books, active, lamaPinjam] = await Promise.all([
    prisma.book.findMany({ orderBy: { title: "asc" } }),
    prisma.loan.findMany({
      where: { returnedAt: null },
      select: { bookId: true, userId: true, user: { select: { name: true, phone: true } } },
    }),
    getLoanWorkingDays(),
  ]);
  const mine = new Set(active.filter((l) => l.userId === user.id).map((l) => l.bookId));
  const taken = new Map<string, number>();
  // Siapa yang sedang memegang tiap buku — pertanyaan "buku A dipinjam siapa?"
  // harus terjawab langsung di rak, bukan harus buka Dashboard lalu cari tab.
  const holders = new Map<string, string[]>();
  for (const l of active) {
    const who = l.user.name.trim() || displayPhone(l.user.phone);
    const list = holders.get(l.bookId) ?? [];
    if (!list.includes(who)) list.push(who);
    holders.set(l.bookId, list);
    taken.set(l.bookId, (taken.get(l.bookId) ?? 0) + 1);
  }
  return (
    <>
      <h1>Rak Buku 📚</h1>
      <p className="muted">Pilih buku, pinjam {lamaPinjam} hari kerja (Ahad tidak dihitung). Maksimal {MAX_ACTIVE_LOANS} buku sekaligus.</p>
      <Catalog
        lamaHari={lamaPinjam}
        isAdmin={user.role === "ADMIN"}
        slotsFull={mine.size >= MAX_ACTIVE_LOANS}
        books={books.map((b) => ({
          id: b.id, title: b.title, author: b.author, pages: b.pages, category: b.category, synopsis: b.synopsis, stock: b.stock,
          coverUrl: b.coverUrl,
          available: Math.max(0, b.stock - (taken.get(b.id) ?? 0)),
          mine: mine.has(b.id),
          holders: holders.get(b.id) ?? [],
        }))}
      />
    </>
  );
}
