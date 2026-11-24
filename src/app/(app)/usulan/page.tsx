import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { UsulanBuku } from "@/components/UsulanBuku";

export const metadata = { title: "Usulkan Buku" };
export const dynamic = "force-dynamic";

export default async function UsulanPage() {
  const user = await requireUser();
  const rows = await prisma.bookRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, title: true, url: true, status: true, createdAt: true },
  });

  return (
    <>
      <h1>Usulkan Buku 💡</h1>
      <p className="muted">Judul saja cukup. Link toko membantu admin cek harga &amp; edisi.</p>
      <UsulanBuku awal={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />
    </>
  );
}
