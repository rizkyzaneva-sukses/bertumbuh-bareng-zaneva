import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayPhone } from "@/lib/phone";
import { ChangePasswordForm, LogoutButton } from "@/components/ProfileClient";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = { title: "Profil" };
export const dynamic = "force-dynamic";

export default async function ProfilPage() {
  const user = await requireUser();
  const [perangkat, usulan] = await Promise.all([
    prisma.pushSubscription.count({ where: { userId: user.id } }),
    prisma.bookRequest.count({ where: { userId: user.id, status: "BARU" } }),
  ]);
  return (
    <>
      <h1>Profil</h1>
      <div className="card">
        <h2>{user.name || "(nama belum diisi)"}</h2>
        <p className="muted" style={{ margin: 0 }}>Nomor HP: {displayPhone(user.phone)} · {user.role === "ADMIN" ? "Admin" : "Anggota"}</p>
      </div>

      {/* Menu sekunder. Bottom nav dibatasi 5 item (Beranda Buku Riwayat
          Dasbor Profil) karena 7 item membuat tombol ~51px di HP 360px. */}
      <div className="card">
        <h2>Menu</h2>
        <Link href="/panduan" className="row between menu-link" data-testid="pintasan-panduan">
          <span>Panduan</span>
          <span className="muted" style={{ fontSize: ".82rem" }}>cara pinjam &amp; baca ›</span>
        </Link>
        <Link href="/notifikasi" className="row between menu-link" data-testid="pintasan-notifikasi">
          <span>Notifikasi</span>
          <span className="muted" style={{ fontSize: ".82rem" }}>
            {perangkat > 0 ? `aktif · ${perangkat} perangkat` : "belum aktif"} ›
          </span>
        </Link>
        <Link href="/usulan" className="row between menu-link" data-testid="pintasan-usulan">
          <span>Usulkan buku</span>
          <span className="muted" style={{ fontSize: ".82rem" }}>
            {usulan > 0 ? `${usulan} menunggu` : "kirim judul"} ›
          </span>
        </Link>
        {user.role === "ADMIN" && (
          <Link href="/admin" className="row between menu-link" data-testid="pintasan-admin">
            <span>Panel admin</span>
            <span className="muted" style={{ fontSize: ".82rem" }}>pinjaman, buku, pengguna ›</span>
          </Link>
        )}
      </div>

      <div className="card">
        <h2>Tampilan</h2>
        <ThemeToggle withLabel />
      </div>
      <div className="card">
        <h2>Ganti password</h2>
        <ChangePasswordForm />
      </div>
      <div className="card">
        <h2>Pasang di layar utama</h2>
        <p className="muted small" style={{ margin: 0 }}><b>iPhone:</b> buka lewat Safari, ketuk tombol Bagikan, pilih “Tambah ke Layar Utama”. <b>Android:</b> buka lewat Chrome, ketuk menu ⋮, pilih “Instal aplikasi”.</p>
      </div>
      <LogoutButton />
    </>
  );
}
