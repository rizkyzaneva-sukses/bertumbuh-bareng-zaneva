import { z } from "zod";
import { prisma } from "@/lib/db";
import { handler, json } from "@/lib/http";
import { kabariPemintaWa } from "@/lib/wa-usulan";

export const dynamic = "force-dynamic";

/** Rekap usulan buku untuk panel admin — satu daftar, bukan scroll chat WA. */
export const GET = handler({ admin: true }, async (req) => {
  const status = req.nextUrl.searchParams.get("status") ?? "";
  const rows = await prisma.bookRequest.findMany({
    where: status && status !== "SEMUA" ? { status: status as "BARU" | "DIPERTIMBANGKAN" | "DIBELI" | "DITOLAK" } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
  });
  const hitung = await prisma.bookRequest.groupBy({ by: ["status"], _count: { _all: true } });
  return json({
    usulan: rows,
    ringkasan: Object.fromEntries(hitung.map((h) => [h.status, h._count._all])),
  });
});

const Ubah = z.object({
  id: z.string().min(1),
  status: z.enum(["BARU", "DIPERTIMBANGKAN", "DIBELI", "DITOLAK"]),
  /// Kirim WA ke peminta? Default ya — Bos: "notif di wa untuk yg request".
  kabari: z.boolean().optional(),
});

/** Ubah status. Kalau DIBELI/DITOLAK, peminta otomatis dikabari lewat WA. */
export const POST = handler({ admin: true }, async (req) => {
  const { id, status, kabari } = Ubah.parse(await req.json());
  const row = await prisma.bookRequest.update({ where: { id }, data: { status } });

  let wa: { terkirim: boolean; alasan?: string; ke?: string } | null = null;
  if (kabari !== false && (status === "DIBELI" || status === "DITOLAK" || status === "DIPERTIMBANGKAN")) {
    wa = await kabariPemintaWa(id, status);
  }
  return json({ ok: true, usulan: row, wa });
});

/** Hapus usulan (mis. spam / dobel). */
export const DELETE = handler({ admin: true }, async (req) => {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return json({ ok: false, error: "id wajib" }, 400);
  await prisma.bookRequest.delete({ where: { id } });
  return json({ ok: true });
});
