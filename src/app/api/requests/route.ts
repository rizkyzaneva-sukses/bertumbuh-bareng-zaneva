import { z } from "zod";
import { prisma } from "@/lib/db";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Usulan yang pernah dikirim user ini — supaya tidak mengirim berulang. */
export const GET = handler({}, async (_req, { user }) => {
  const rows = await prisma.bookRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, title: true, url: true, status: true, createdAt: true },
  });
  return json({ usulan: rows });
});

const Baru = z.object({
  title: z.string().trim().min(2, "Judul minimal 2 karakter").max(200),
  url: z.string().trim().max(500).optional().default(""),
});

/**
 * Usulan dari dalam app (alternatif WA).
 *
 * Duplikat dicegah per user+judul dalam 24 jam: orang yang menekan tombol dua
 * kali tidak membuat dua baris di rekap admin.
 */
export const POST = handler({}, async (req, { user }) => {
  const { title, url } = Baru.parse(await req.json());

  const sudah = await prisma.bookRequest.findFirst({
    where: {
      userId: user.id,
      title: { equals: title, mode: "insensitive" },
      createdAt: { gte: new Date(Date.now() - 86400_000) },
    },
    select: { id: true },
  });
  if (sudah) return json({ ok: true, dobel: true, id: sudah.id, pesan: "Usulan ini sudah kamu kirim." });

  const row = await prisma.bookRequest.create({
    data: { userId: user.id, phone: user.phone, name: user.name, title, url, source: "APP" },
    select: { id: true, title: true },
  });
  return json({ ok: true, usulan: row });
});
