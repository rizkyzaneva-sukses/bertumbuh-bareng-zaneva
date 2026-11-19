import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { displayPhone } from "@/lib/phone";
import { SEED_ADMIN_PHONES } from "@/lib/seed";
import { BulkAdd, AddUser, UserList } from "@/components/AdminUsers";

export const metadata = { title: "Admin · Pengguna" };

export default async function AdminPengguna() {
  const me = await requireAdminPage();
  const users = await prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });
  return (
    <>
      <AddUser />
      <BulkAdd />
      <h2>Data pengguna ({users.length})</h2>
      <p className="muted small">Password sementara tampil di sini sampai orangnya mengganti passwordnya sendiri. Jaga kerahasiaan halaman ini.</p>
      <UserList
        users={users.map((u) => ({
          id: u.id, name: u.name, phone: u.phone, display: displayPhone(u.phone), role: u.role,
          mustChangePassword: u.mustChangePassword, tempPassword: u.tempPassword,
          protectedUser: SEED_ADMIN_PHONES.includes(u.phone), isSelf: u.id === me.id,
        }))}
      />
    </>
  );
}
