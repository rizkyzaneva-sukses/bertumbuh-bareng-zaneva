import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { fail, handler, json } from "@/lib/http";

const Body = z.object({
  oldPassword: z.string().optional(),
  newPassword: z.string().min(8, "Password baru minimal 8 karakter").max(100),
});

export const POST = handler({ allowMustChange: true }, async (req, { user }) => {
  const { oldPassword, newPassword } = Body.parse(await req.json());
  // Saat wajib ganti password (baru login dengan password sementara), password lama tidak diminta lagi.
  if (!user.mustChangePassword) {
    if (!oldPassword || !(await verifyPassword(oldPassword, user.passwordHash))) return fail("Password lama salah", 400, "BAD_OLD");
  }
  if (await verifyPassword(newPassword, user.passwordHash)) return fail("Password baru harus berbeda dari password sekarang", 400, "SAME");
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false, tempPassword: null },
  });
  return json({ ok: true });
});
