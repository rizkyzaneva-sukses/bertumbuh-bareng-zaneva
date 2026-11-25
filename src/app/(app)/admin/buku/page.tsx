import { prisma } from "@/lib/db";
import { AdminBooks } from "@/components/AdminBooks";
import { RAK_FILTER } from "@/lib/archive";

export const metadata = { title: "Admin · Buku" };
export const dynamic = "force-dynamic";

export default async function AdminBuku() {
  const [books, archived, active, damaged] = await Promise.all([
    prisma.book.findMany({ where: RAK_FILTER, orderBy: { title: "asc" } }),
    // Arsip dipisah: buku di arsip TIDAK di rak, tapi datanya utuh dan bisa
    // dikembalikan. Daftarnya tetap ditampilkan di sini supaya admin tidak
    // "kehilangan" buku yang pernah disimpan.
    prisma.book.findMany({ where: { archivedAt: { not: null } }, orderBy: { archivedAt: "desc" } }),
    prisma.loan.groupBy({ by: ["bookId"], where: { returnedAt: null }, _count: true }),
    // Buku yang pernah kembali rusak/hilang — supaya admin tahu mana yang perlu diganti.
    prisma.loan.groupBy({
      by: ["bookId", "condition"],
      where: { condition: { in: ["RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"] } },
      _count: true,
    }),
  ]);
  const a = new Map(active.map((x) => [x.bookId, x._count]));
  const issues = new Map<string, { ringan: number; berat: number; hilang: number }>();
  for (const d of damaged) {
    const cur = issues.get(d.bookId) ?? { ringan: 0, berat: 0, hilang: 0 };
    if (d.condition === "RUSAK_RINGAN") cur.ringan += d._count;
    else if (d.condition === "RUSAK_BERAT") cur.berat += d._count;
    else if (d.condition === "HILANG") cur.hilang += d._count;
    issues.set(d.bookId, cur);
  }
  const totalBermasalah = [...issues.values()].reduce((s, v) => s + v.ringan + v.berat + v.hilang, 0);

  const view = (b: (typeof books)[number]) => ({
    id: b.id,
    title: b.title,
    author: b.author,
    pages: b.pages,
    category: b.category,
    synopsis: b.synopsis,
    stock: b.stock,
    coverUrl: b.coverUrl,
    archivedAt: b.archivedAt ? b.archivedAt.toISOString() : null,
    active: a.get(b.id) ?? 0,
    issues: issues.get(b.id) ?? { ringan: 0, berat: 0, hilang: 0 },
  });

  return (
    <AdminBooks
      totalIssues={totalBermasalah}
      books={books.map(view)}
      archived={archived.map(view)}
    />
  );
}
