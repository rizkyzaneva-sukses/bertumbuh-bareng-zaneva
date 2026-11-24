import { z } from "zod";
import { prisma } from "@/lib/db";
import { handler, json, fail } from "@/lib/http";
import { kunciPublik, pushTerkonfigurasi } from "@/lib/push/kirim";

export const dynamic = "force-dynamic";

const Skema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(10).max(300),
    auth: z.string().min(5).max(100),
  }),
});

/** GET: kunci publik + jumlah perangkat user ini. */
export const GET = handler({}, async (_req, { user }) => {
  const jumlahPerangkat = await prisma.pushSubscription.count({ where: { userId: user.id } });
  return json({
    publicKey: kunciPublik(),
    terkonfigurasi: pushTerkonfigurasi(),
    // UI memakai ini untuk membedakan "server belum siap" vs "HP belum aktif".
    jumlahPerangkat,
  });
});

/**
 * POST: upsert langganan.
 *
 * Upsert per `endpoint`, bukan create: kalau satu HP dipakai bergantian
 * (logout A, login B), kepemilikan harus PINDAH, bukan jadi dua baris.
 */
export const POST = handler({}, async (req, { user }) => {
  const data = Skema.parse(await req.json());
  await prisma.pushSubscription.upsert({
    where: { endpoint: data.endpoint },
    update: { userId: user.id, p256dh: data.keys.p256dh, auth: data.keys.auth },
    create: {
      userId: user.id,
      endpoint: data.endpoint,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
      userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    },
  });
  const jumlah = await prisma.pushSubscription.count({ where: { userId: user.id } });
  return json({ ok: true, perangkat: jumlah });
});

/** DELETE: matikan notifikasi di perangkat ini saja. */
export const DELETE = handler({}, async (req, { user }) => {
  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return fail("endpoint wajib diisi", 400, "VALIDATION");
  const res = await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return json({ ok: true, dihapus: res.count });
});
