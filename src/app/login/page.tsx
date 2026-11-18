import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = { title: "Masuk" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="center-page">
      <div className="center-card">
        <div className="card" style={{ padding: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="/icons/icon-192.png" alt="" />
          <h1 style={{ textAlign: "center" }}>Bertumbuh Bareng Zaneva</h1>
          <p className="muted" style={{ textAlign: "center" }}>Masuk pakai nomor HP yang didaftarkan admin. Belum punya akun? Minta admin daftarin ya.</p>
          <LoginForm />
        </div>
        <div style={{ textAlign: "center" }}><ThemeToggle withLabel /></div>
      </div>
    </main>
  );
}
