import { requireUser } from "@/lib/auth";
import { displayPhone } from "@/lib/phone";
import { ChangePasswordForm, LogoutButton } from "@/components/ProfileClient";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = { title: "Profil" };

export default async function ProfilPage() {
  const user = await requireUser();
  return (
    <>
      <h1>Profil</h1>
      <div className="card">
        <h2>{user.name || "(nama belum diisi)"}</h2>
        <p className="muted" style={{ margin: 0 }}>Nomor HP: {displayPhone(user.phone)} · {user.role === "ADMIN" ? "Admin" : "Anggota"}</p>
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
