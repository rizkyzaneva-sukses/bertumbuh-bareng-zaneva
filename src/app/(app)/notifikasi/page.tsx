import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { AktifkanNotifikasi } from "@/components/push/AktifkanNotifikasi";

export const metadata = { title: "Notifikasi" };
export const dynamic = "force-dynamic";

export default async function NotifikasiPage() {
  const user = await requireUser();
  const perangkat = await prisma.pushSubscription.count({ where: { userId: user.id } });

  return (
    <>
      <h1>Notifikasi 🔔</h1>
      <p className="muted">
        Dapat kabar saat ada <b>buku baru</b> dan saat buku pinjamanmu hampir jatuh tempo. Gratis, tanpa WA.
      </p>

      <div className="card">
        <AktifkanNotifikasi />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <b>Perangkat terdaftar: {perangkat}</b>
        <p className="muted" style={{ fontSize: ".82rem", margin: "4px 0 0" }}>
          Satu akun bisa aktif di beberapa perangkat (HP + laptop). Matikan di perangkat yang tidak dipakai lagi.
        </p>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <b>Kenapa notifikasi tidak muncul?</b>
        <p className="muted" style={{ fontSize: ".82rem", margin: "6px 0 0", lineHeight: 1.6 }}>
          • <b>Xiaomi / Oppo / Vivo / Huawei</b>: setelan baterai agresif menelan notifikasi. Buka Setelan → Aplikasi → Chrome
          → Baterai → <b>Tanpa batasan</b>.
          <br />• <b>Huawei tanpa Google Play Services</b>: Web Push tidak bisa jalan (batasan Google, bukan app).
          <br />• Ikon <b>lonceng bergaris</b> di panel notifikasi = mode senyap aktif.
          <br />• <b>iPhone</b>: wajib Add to Home Screen dulu (iOS 16.4+).
        </p>
      </div>
    </>
  );
}
