import { z } from "zod";
import { prisma } from "@/lib/db";
import { handler, json } from "@/lib/http";
import { kabariPemintaWa } from "@/lib/wa-usulan";
import { kirimPushKeUser, pushTerkonfigurasi } from "@/lib/push/kirim";

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

const JUDUL_PUSH: Record<string, string> = {
  DIBELI: "Buku usulanmu sudah ada 📚",
  DITOLAK: "Usulan bukumu belum bisa diadakan",
  DIPERTIMBANGKAN: "Usulan bukumu sedang ditinjau",
};

const ISI_PUSH: Record<string, (judul: string) => string> = {
  DIBELI: (judul) => `"${judul}" sudah masuk rak perpustakaan. Pinjam sebelum kehabisan.`,
  DITOLAK: (judul) => `"${judul}" belum bisa kami adakan tahun ini. Boleh usul judul lain.`,
  DIPERTIMBANGKAN: (judul) => `"${judul}" sedang dipertimbangkan admin. Nanti dikabari lagi.`,
};

/**
 * Ubah status. Kalau DIBELI/DITOLAK/DIPERTIMBANGKAN, peminta dikabari lewat WA
 * **dan** notifikasi app.
 *
 * Bos: *"Ketika usulan dibeli dan barang masuk rak, notifnya ke appsnya ke semua
 * orang atau orang itu aja"* — usulan itu percakapan pribadi antara peminta dan
 * admin, jadi notifikasi app-nya **hanya ke peminta** (kalau akunnya ada di app).
 * Pengumuman "buku baru" ke semua orang sudah punya jalurnya sendiri saat admin
 * menambah buku ke rak (`kabariBukuBaru`), jadi tidak digandakan di sini.
 */
export const POST = handler({ admin: true }, async (req) => {
  const { id, status, kabari } = Ubah.parse(await req.json());
  const row = await prisma.bookRequest.update({ where: { id }, data: { status } });

  let wa: { terkirim: boolean; alasan?: string; ke?: string } | null = null;
  if (kabari !== false && (status === "DIBELI" || status === "DITOLAK" || status === "DIPERTIMBANGKAN")) {
    wa = await kabariPemintaWa(id, status);
  }

  // Notifikasi app ke peminta. Gagal push TIDAK membatalkan perubahan status —
  // status sudah tersimpan di atas; hanya push-nya yang tidak sampai.
  let push: { tujuan: number; terkirim: number } | null = null;
  if (kabari !== false && row.userId && pushTerkonfigurasi() && JUDUL_PUSH[status]) {
    try {
      const hasil = await kirimPushKeUser([row.userId], {
        title: JUDUL_PUSH[status],
        body: ISI_PUSH[status](row.title),
        url: "/usulan",
        tag: `usulan-${row.id}`,
      });
      push = { tujuan: hasil.tujuan, terkirim: hasil.terkirim };
    } catch (e) {
      console.error("[usulan] push gagal:", String((e as Error).message ?? e).slice(0, 160));
    }
  }

  return json({ ok: true, usulan: row, wa, push });
});

/** Hapus usulan (mis. spam / dobel). */
export const DELETE = handler({ admin: true }, async (req) => {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return json({ ok: false, error: "id wajib" }, 400);
  await prisma.bookRequest.delete({ where: { id } });
  return json({ ok: true });
});
