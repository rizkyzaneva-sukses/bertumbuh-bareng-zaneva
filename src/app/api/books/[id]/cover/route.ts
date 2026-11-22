import { prisma } from "@/lib/db";
import { AppError } from "@/lib/loans";
import { handler, json, fail } from "@/lib/http";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — cukup untuk sampul 1000px
const OK_MIME = ["image/jpeg", "image/png", "image/webp"];

/**
 * Gambar sampul hasil unggahan (disimpan di DB, bukan disk).
 *
 * `allowMustChange: true` supaya gambar tetap tampil saat modal onboarding
 * menutupi app — kalau tidak, rak akan penuh kotak rusak untuk pengguna baru.
 */
export const GET = handler<{ id: string }>(
  { allowMustChange: true },
  async (_req, { params }) => {
    const cover = await prisma.bookCover.findUnique({ where: { bookId: params.id } });
    if (!cover) throw new AppError("NOT_FOUND", "Sampul tidak ada", 404);
    const body = new Blob([new Uint8Array(cover.bytes)], { type: cover.mime });
    return new Response(body, {
      headers: {
        "Content-Type": cover.mime,
        "Content-Length": String(body.size),
        // Nama file sudah memuat ?v=<timestamp>, jadi aman di-cache lama.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
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
