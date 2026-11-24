import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { AdminRequests } from "@/components/AdminRequests";
import { pushTerkonfigurasi } from "@/lib/push/kirim";

export const metadata = { title: "Admin · Usulan Buku" };
export const dynamic = "force-dynamic";

export default async function AdminUsulanPage() {
  await requireAdminPage();
  const [rows, hitung, perangkat] = await Promise.all([
    prisma.bookRequest.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 300 }),
    prisma.bookRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.pushSubscription.count(),
  ]);
  const ringkas = Object.fromEntries(hitung.map((h) => [h.status, h._count._all]));

  return (
    <>
      <h2>Usulan buku</h2>
      <p className="muted" style={{ fontSize: ".85rem" }}>
        {ringkas.BARU ?? 0} baru · {ringkas.DIPERTIMBANGKAN ?? 0} dipertimbangkan · {ringkas.DIBELI ?? 0} dibeli ·{" "}
        {ringkas.DITOLAK ?? 0} ditolak
      </p>

      <div className="card" style={{ marginBottom: 14, background: "var(--bg2)" }}>
        <b>Karyawan mengusulkan lewat WA</b>
        <p className="muted" style={{ fontSize: ".82rem", margin: "4px 0 0", lineHeight: 1.6 }}>
          Kirim ke nomor Zaneva Official: <code>#usul Judul Buku</code> — link Shopee boleh ditambahkan di belakangnya.
          Usulan otomatis masuk daftar ini dan peminta dibalas otomatis.
          <br />
          Notifikasi buku baru: <b>{pushTerkonfigurasi() ? "aktif" : "belum disiapkan"}</b> · perangkat terdaftar:{" "}
          <b>{perangkat}</b>
        </p>
      </div>

      <AdminRequests awal={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />
    </>
  );
}
