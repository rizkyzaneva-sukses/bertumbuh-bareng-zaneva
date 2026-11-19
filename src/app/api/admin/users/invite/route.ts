import { z } from "zod";
import { prisma } from "@/lib/db";
import { defaultPassword, hashPassword } from "@/lib/password";
import { normalizePhone } from "@/lib/phone";
import { checkName } from "@/lib/profile";
import { AppError } from "@/lib/loans";
import { handler, json } from "@/lib/http";

const Body = z.object({
  phone: z.string().min(1, "Nomor HP wajib diisi"),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
  /** Boleh dikosongkan: orangnya sendiri yang mengisi nama saat login pertama. */
  name: z.string().max(80).optional(),
  /** Password sementara; kosong = DEFAULT_PASSWORD dari server. */
  password: z.string().max(100).optional(),
});

/**
 * Daftarkan satu pengguna (admin/anggota). Kalau `name` kosong, akun dibuat tanpa
 * nama dan orangnya wajib mengisi Nama + Password saat login pertama.
 */
export const POST = handler({ admin: true }, async (req, { user }) => {
  const { phone, role, name, password } = Body.parse(await req.json());

  const norm = normalizePhone(phone);
  if (!norm) throw new AppError("PHONE", "Nomor HP tidak valid. Contoh: 081234567890", 400);

  const existing = await prisma.user.findUnique({ where: { phone: norm } });
  if (existing) throw new AppError("DUPLICATE", `${existing.name || existing.phone} sudah terdaftar`, 409);

  let finalName = "";
  if (name && name.trim()) {
    const checked = checkName(name);
    if (!checked.ok) throw new AppError("NAME", checked.reason, 400);
    finalName = checked.name;
  }

  const pw = password?.trim() || defaultPassword();
  if (pw.length < 6) throw new AppError("PASSWORD", "Password sementara minimal 6 karakter", 400);

  const created = await prisma.user.create({
    data: {
      name: finalName,
      phone: norm,
      passwordHash: await hashPassword(pw),
      tempPassword: pw,
      role,
      mustChangePassword: true,
    },
  });

  return json({
    ok: true,
    user: { id: created.id, name: created.name, phone: created.phone, role: created.role },
    tempPassword: pw,
    needsName: !created.name,
    invite: `Halo! Akun Bertumbuh Bareng Zaneva kamu sudah dibuat.\n\nMasuk di https://books.maulanacorp.biz.id\nNomor: ${phone.trim()}\nPassword sementara: ${pw}\n\nSaat pertama masuk, kamu diminta mengisi Nama dan membuat password sendiri.`,
    createdBy: user.name || user.phone,
  });
});
