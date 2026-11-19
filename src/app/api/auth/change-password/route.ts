import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { checkName } from "@/lib/profile";
import { fail, handler, json } from "@/lib/http";

const Body = z.object({
  oldPassword: z.string().optional(),
  newPassword: z.string().min(8, "Password baru minimal 8 karakter").max(100),
  /** Opsional: diisi saat onboarding pertama (nama belum ada / mau diubah). */
  name: z.string().max(80).optional(),
});

/**
 * Ganti password. Kalau `name` dikirim, nama profil ikut disimpan — ini yang
 * dipakai popup onboarding supaya orang baru mengisi Nama + Password sekaligus.
 */
export const POST = handler({ allowMustChange: true }, async (req, { user }) => {
  const { oldPassword, newPassword, name } = Body.parse(await req.json());

  // Saat wajib ganti password (baru login dengan password sementara), password lama tidak diminta lagi.
  if (!user.mustChangePassword) {
    if (!oldPassword || !(await verifyPassword(oldPassword, user.passwordHash))) return fail("Password lama salah", 400, "BAD_OLD");
  }
  if (await verifyPassword(newPassword, user.passwordHash)) return fail("Password baru harus berbeda dari password sekarang", 400, "SAME");

  const data: { passwordHash: string; mustChangePassword: boolean; tempPassword: null; name?: string } = {
    passwordHash: await hashPassword(newPassword),
    mustChangePassword: false,
    tempPassword: null,
  };

  if (name !== undefined) {
    const checked = checkName(name);
    if (!checked.ok) return fail(checked.reason, 400, "NAME");
    data.name = checked.name;
  }
  // Nama masih kosong dan tidak diisi -> tolak, jangan sampai profil tanpa nama.
  if (data.name === undefined && !user.name.trim()) return fail("Nama wajib diisi", 400, "NAME");

  const u = await prisma.user.update({ where: { id: user.id }, data });
  return json({ ok: true, name: u.name });
});
