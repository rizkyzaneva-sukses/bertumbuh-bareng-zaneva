import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseUserList } from "@/lib/csv";
import { defaultPassword, hashPassword } from "@/lib/password";
import { fail, handler, json } from "@/lib/http";

const Body = z.object({
  text: z.string().min(1, "Daftar kosong"),
  /** Password sementara untuk semua user baru; kosong = DEFAULT_PASSWORD */
  password: z.string().max(100).optional(),
});

export const GET = handler({ admin: true }, async () => {
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  return json({
    ok: true,
    users: users.map((u) => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, mustChangePassword: u.mustChangePassword, tempPassword: u.tempPassword })),
  });
});

/** Daftarkan banyak user sekaligus dari teks tempelan / isi CSV ("nama, nomor HP" per baris). */
export const POST = handler({ admin: true }, async (req) => {
  const { text, password } = Body.parse(await req.json());
  const pw = password?.trim() || defaultPassword();
  if (pw.length < 6) return fail("Password sementara minimal 6 karakter", 400, "PASSWORD");
  const { rows, errors } = parseUserList(text);
  if (rows.length === 0 && errors.length === 0) return fail("Tidak ada baris yang bisa dibaca", 400);
  const hash = await hashPassword(pw);
  const existing = await prisma.user.findMany({ where: { phone: { in: rows.map((r) => r.phone) } }, select: { phone: true, name: true } });
  const taken = new Set(existing.map((e) => e.phone));
  const fresh = rows.filter((r) => !taken.has(r.phone));
  if (fresh.length) {
    await prisma.user.createMany({
      data: fresh.map((r) => ({ name: r.name, phone: r.phone, passwordHash: hash, tempPassword: pw, role: "MEMBER" as const, mustChangePassword: true })),
      skipDuplicates: true,
    });
  }
  return json({
    ok: true,
    created: fresh.length,
    skipped: rows.filter((r) => taken.has(r.phone)).map((r) => ({ ...r, reason: "Nomor sudah terdaftar" })),
    errors,
  });
});
