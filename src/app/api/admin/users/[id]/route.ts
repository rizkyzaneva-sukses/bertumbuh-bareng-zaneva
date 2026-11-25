import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/loans";
import { normalizePhone } from "@/lib/phone";
import { checkName } from "@/lib/profile";
import { SEED_ADMIN_PHONES } from "@/lib/seed";
import { handler, json } from "@/lib/http";

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  phone: z.string().optional(),
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
});

export const PATCH = handler<{ id: string }>({ admin: true }, async (req, { user, params }) => {
  const data = Patch.parse(await req.json());
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) throw new AppError("NOT_FOUND", "User tidak ditemukan", 404);

  const isSeedAdmin = SEED_ADMIN_PHONES.includes(target.phone);

  const update: { name?: string; phone?: string; role?: "ADMIN" | "MEMBER" } = {};
  if (data.name) {
    const checked = checkName(data.name);
    if (!checked.ok) throw new AppError("NAME", checked.reason, 400);
    update.name = checked.name;
  }
  if (data.phone) {
    // CELAH YANG DITUTUP: proteksi admin utama di bawah dicek lewat NOMOR HP.
    // Kalau nomor admin utama boleh diganti, proteksinya ikut hilang — satu
    // request PATCH sudah cukup untuk membuka jalan menurunkan/menghapusnya.
    // Karena itu nomor admin utama dikunci.
    if (isSeedAdmin) throw new AppError("SEED", "Nomor HP admin utama tidak bisa diubah.", 400);
    const p = normalizePhone(data.phone);
    if (!p) throw new AppError("PHONE", "Nomor HP tidak valid. Contoh: 081234567890", 400);
    if (p === target.phone) {
      // tidak ada perubahan — jangan sentuh apa pun
    } else {
      const dupe = await prisma.user.findUnique({ where: { phone: p } });
      if (dupe && dupe.id !== target.id) throw new AppError("DUPLICATE", "Nomor itu sudah dipakai user lain", 409);
      update.phone = p;
    }
  }
  if (data.role) {
    if (target.id === user.id && data.role !== "ADMIN") throw new AppError("SELF", "Kamu tidak bisa mencabut admin dirimu sendiri", 400);
    if (isSeedAdmin && data.role !== "ADMIN") throw new AppError("SEED", "Admin utama tidak bisa diturunkan", 400);
    update.role = data.role;
  }
  if (Object.keys(update).length === 0) return json({ ok: true, user: { id: target.id, name: target.name, phone: target.phone, role: target.role }, unchanged: true });

  const u = await prisma.user.update({ where: { id: target.id }, data: update });
  return json({ ok: true, user: { id: u.id, name: u.name, phone: u.phone, role: u.role } });
});

export const DELETE = handler<{ id: string }>({ admin: true }, async (_req, { user, params }) => {
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) throw new AppError("NOT_FOUND", "User tidak ditemukan", 404);
  if (target.id === user.id) throw new AppError("SELF", "Kamu tidak bisa menghapus akunmu sendiri", 400);
  if (SEED_ADMIN_PHONES.includes(target.phone)) throw new AppError("SEED", "Admin utama tidak bisa dihapus", 400);
  const active = await prisma.loan.count({ where: { userId: target.id, returnedAt: null } });
  if (active > 0) throw new AppError("ACTIVE_LOANS", `User ini masih meminjam ${active} buku. Tandai dikembalikan dulu.`, 409);
  await prisma.user.delete({ where: { id: target.id } });
  return json({ ok: true });
});
