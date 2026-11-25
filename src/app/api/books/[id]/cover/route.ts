import sharp from "sharp";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/loans";
import { handler, json, fail } from "@/lib/http";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — cukup untuk sampul 1000px
const OK_MIME = ["image/jpeg", "image/png", "image/webp"];

/**
 * Lebar yang boleh diminta lewat `?w=`.
 *
 * Kenapa daftar tetap, bukan angka bebas: kalau menerima sembarang angka,
 * orang bisa memaksa server merender ratusan ukuran berbeda (`?w=1`, `?w=2`,
 * …) dan menghabiskan CPU. Daftar ini menutup celah itu.
 */
const LEBAR_DIIZINKAN = [56, 76, 112, 152, 160, 220, 320, 440];
const KUALITAS = 72;

/**
 * Cache hasil resize di memori proses (LRU sederhana).
 * Kunci memuat `versi` dari `?v=` sehingga sampul yang diganti admin tidak
 * memakai hasil lama.
 */
const cache = new Map<string, { body: Buffer; mime: string }>();
const CACHE_MAKS = 200;

function simpanCache(kunci: string, body: Buffer, mime: string) {
  if (cache.size >= CACHE_MAKS) {
    const tertua = cache.keys().next().value;
    if (tertua) cache.delete(tertua);
  }
  cache.set(kunci, { body, mime });
}

/**
 * Gambar sampul hasil unggahan (disimpan di DB, bukan disk).
 *
 * `allowMustChange: true` supaya gambar tetap tampil saat modal onboarding
 * menutupi app — kalau tidak, rak akan penuh kotak rusak untuk pengguna baru.
 *
 * Pengecilan dilakukan DI SINI, bukan lewat /_next/image: optimizer bawaan
 * Next mengambil gambar tanpa cookie sesi → rute ini membalas 401 → semua
 * sampul rusak (dibuktikan di browser: 20/20 broken). Dengan resize di rute
 * ini, cookie browser ikut terkirim dan HP hanya mengunduh versi kecil.
 */
export const GET = handler<{ id: string }>(
  { allowMustChange: true },
  async (req, { params }) => {
    const cover = await prisma.bookCover.findUnique({ where: { bookId: params.id } });
    if (!cover) throw new AppError("NOT_FOUND", "Sampul tidak ada", 404);

    const asli = Buffer.from(cover.bytes);
    const url = new URL(req.url);
    const diminta = Number(url.searchParams.get("w") ?? 0);
    const versi = url.searchParams.get("v") ?? "0";

    // Tanpa ?w= yang dikenal → sajikan apa adanya. Menjaga pratinjau admin,
    // tautan lama, dan pemakaian di tempat lain tetap utuh.
    if (!LEBAR_DIIZINKAN.includes(diminta)) {
      return new Response(new Uint8Array(asli), {
        headers: {
          "Content-Type": cover.mime,
          "Content-Length": String(asli.length),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    const kunci = `${params.id}:${versi}:${diminta}`;
    const tersimpan = cache.get(kunci);
    if (tersimpan) {
      return new Response(new Uint8Array(tersimpan.body), {
        headers: {
          "Content-Type": tersimpan.mime,
          "Content-Length": String(tersimpan.body.length),
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Sampul-Cache": "HIT",
        },
      });
    }

    // Kalau sharp gagal (mis. libvips tak tersedia di image), JANGAN balas
    // error — kirim gambar asli. Sampul wajib tetap tampil; optimasi nomor dua.
    try {
      const hasil = await sharp(asli).resize({ width: diminta, withoutEnlargement: true }).webp({ quality: KUALITAS }).toBuffer();
      const mime = "image/webp";
      simpanCache(kunci, hasil, mime);
      return new Response(new Uint8Array(hasil), {
        headers: {
          "Content-Type": mime,
          "Content-Length": String(hasil.length),
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Sampul-Cache": "MISS",
        },
      });
    } catch (e) {
      console.error("[cover] resize gagal, kirim asli:", (e as Error).message);
      return new Response(new Uint8Array(asli), {
        headers: {
          "Content-Type": cover.mime,
          "Content-Length": String(asli.length),
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Sampul-Cache": "FALLBACK",
        },
      });
    }
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
