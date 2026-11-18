import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <>
      <h1>Panel Admin 🛠️</h1>
      <div className="tabs">
        <Link href="/admin/pinjaman">Pinjaman</Link>
        <Link href="/admin/buku">Buku</Link>
        <Link href="/admin/pengguna">Pengguna</Link>
        <Link href="/admin/pengingat">Pengingat WA</Link>
      </div>
      {children}
    </>
  );
}
