import { prisma } from "@/lib/db";
import { AppError } from "@/lib/loans";
import { handler, json, fail } from "@/lib/http";
import { sajikanSampul, MAX_BYTES, OK_MIME } from "@/lib/sampul";

/**
 * Gambar sampul buku hasil unggahan (disimpan di DB, bukan disk).
 *
 * GET di sini adalah jalur LAMA. Jalur utama untuk rak sekarang
 * `/api/books/<id>/cover/<versi>/<lebar>.webp` (lihat `src/lib/sampul.ts`),
 * karena Cloudflare hanya meng-cache URL ber-ekstensi berkas. Rute ini tetap
 * dipertahankan supaya tautan lama dan pratinjau admin tidak rusak.
 *
 * `allowMustChange: true` supaya gambar tetap tampil saat modal onboarding
 * menutupi app — kalau tidak, rak akan penuh kotak rusak untuk pengguna baru.
 */
export const GET = handler<{ id: string }>(
  { allowMustChange: true },
  async (req, { params }) => {
    const url = new URL(req.url);
    const diminta = Number(url.searchParams.get("w") ?? 0);
    const versi = url.searchParams.get("v") ?? "0";
    return sajikanSampul(params.id, diminta, versi);
  },
);

/** Unggah/ganti sampul. Body: multipart/form-data dengan field `file`. */
export const POST = handler<{ id: string }>({ admin: true }, async (req, { params }) => {
  const book = await prisma.book.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!book) throw new AppError("NOT_FOUND", "Buku tidak ditemukan", 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Kirim berkas sebagai multipart/form-data", 400, "FORMAT");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail("Berkas sampul tidak ditemukan", 400, "NO_FILE");
  if (file.size === 0) return fail("Berkas kosong", 400, "EMPTY");
  if (file.size > MAX_BYTES) return fail("Ukuran sampul maksimal 2 MB", 413, "TOO_BIG");
  if (!OK_MIME.includes(file.type)) return fail("Format harus JPG, PNG, atau WebP", 415, "MIME");

  const bytes = new Uint8Array(await file.arrayBuffer());
  await prisma.bookCover.upsert({
    where: { bookId: book.id },
    create: { bookId: book.id, mime: file.type, bytes },
    update: { mime: file.type, bytes },
  });
  // `?v=` membuat browser mengambil gambar baru, bukan cache lama.
  const coverUrl = `/api/books/${book.id}/cover?v=${Date.now()}`;
  const updated = await prisma.book.update({ where: { id: book.id }, data: { coverUrl }, select: { coverUrl: true } });
  return json({ ok: true, coverUrl: updated.coverUrl });
});

/** Hapus sampul unggahan → buku kembali memakai sampul generatif. */
export const DELETE = handler<{ id: string }>({ admin: true }, async (_req, { params }) => {
  await prisma.bookCover.deleteMany({ where: { bookId: params.id } });
  await prisma.book.update({ where: { id: params.id }, data: { coverUrl: "" } }).catch(() => null);
  return json({ ok: true });
});
