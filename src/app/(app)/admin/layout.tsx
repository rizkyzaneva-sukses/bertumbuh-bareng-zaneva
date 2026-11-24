import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <>
      <h1>Panel Admin</h1>
      <div className="tabs admin-tabs">
        <Link href="/admin/pinjaman">Pinjam</Link>
        <Link href="/admin/buku">Buku</Link>
        <Link href="/admin/pengguna">User</Link>
        <Link href="/admin/usulan">Usulan</Link>
        <Link href="/admin/pengingat">WA</Link>
      </div>
      {children}
    </>
  );
}
