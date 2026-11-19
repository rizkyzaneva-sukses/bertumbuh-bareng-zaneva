import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { verifyPassword } from "@/lib/password";
import { clearFails, recordFail, tooMany } from "@/lib/ratelimit";
import { fail, handler, json } from "@/lib/http";

const Body = z.object({ phone: z.string().min(1, "Isi nomor HP"), password: z.string().min(1, "Isi password") });

export const POST = handler({ auth: false }, async (req) => {
  const { phone, password } = Body.parse(await req.json());
  const norm = normalizePhone(phone);
  if (!norm) return fail("Nomor HP tidak valid. Contoh: 081234567890", 400, "PHONE");
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const keys = [`p:${norm}`, `i:${ip}`];
  if (keys.some((k) => tooMany(k, k.startsWith("p:") ? 8 : 40))) return fail("Terlalu banyak percobaan. Coba lagi 15 menit lagi.", 429, "RATE");
  const user = await prisma.user.findUnique({ where: { phone: norm } });
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    keys.forEach((k) => recordFail(k));
    return fail("Nomor HP atau password salah", 401, "BAD_LOGIN");
  }
  clearFails(`p:${norm}`);
  const session = await getSession();
  session.userId = user.id;
  await session.save();
  return json({ ok: true, mustChangePassword: user.mustChangePassword, needsName: !user.name.trim(), role: user.role });
});
