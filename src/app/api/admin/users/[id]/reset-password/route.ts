import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/loans";
import { defaultPassword, hashPassword } from "@/lib/password";
import { handler, json } from "@/lib/http";

const Body = z.object({ password: z.string().min(6, "Minimal 6 karakter").max(100).optional() }).default({});

/** Kembalikan password user ke password sementara (default dari env, atau yang diisi admin). Wajib ganti lagi saat login. */
export const POST = handler<{ id: string }>({ admin: true }, async (req, { params }) => {
  const raw = await req.json().catch(() => ({}));
  const { password } = Body.parse(raw);
  const pw = password || defaultPassword();
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) throw new AppError("NOT_FOUND", "User tidak ditemukan", 404);
  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(pw), tempPassword: pw, mustChangePassword: true },
  });
  return json({ ok: true, tempPassword: pw });
});
