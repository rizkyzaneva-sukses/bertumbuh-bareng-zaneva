import sharp from "sharp";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/loans";

/**
 * Penyaji sampul buku — dipakai DUA rute:
 *
 *  1. `/api/books/<id>/cover?w=<lebar>            → rute lama (tautan lama, pratinjau admin)
 *  2. `/api/books/<id>/cover/<versi>/<lebar>.webp → rute ber-EKSTENSI untuk CDN
 *
 * Kenapa harus ada rute ber-ekstensi (ini temuan penting, bukan hiasan):
 * Cloudflare hanya menyimpan respons di cache tepi kalau URL-nya berakhiran
 * ekstensi berkas statis (`.webp`, `.jpg`, …). Path `/api/books/x/cover?w=320`
 * tidak punya ekstensi, jadi `Cache-Control: public, immutable` yang sudah kita
 * kirim DIIABAIKAN dan setiap permintaan tetap menyeberang ke server
 * (`cf-cache-status: DYNAMIC`). Begitu URL-nya berakhiran `.webp`, Cloudflare
 * menyimpannya dan permintaan berikutnya tidak lagi menyentuh server sama sekali.
 *
 * Lebar dan versi ditaruh di PATH, bukan query string, supaya identitas cache
 * tidak bergantung pada setelan "Cache Level" Cloudflare (yang bisa
 * mengabaikan query string → lebar 440 dan 320 bisa tertukar).
 */

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — cukup untuk sampul 1000px
const OK_MIME = ["image/jpeg", "image/png", "image/webp"];

/**
 * Lebar yang boleh diminta.
 *
 * Kenapa daftar tetap, bukan angka bebas: kalau menerima sembarang angka,
 * orang bisa memaksa server merender ratusan ukuran berbeda (`?w=1`, `?w=2`,
 * …) dan menghabiskan CPU. Daftar ini menutup celah itu.
 */
export const LEBAR_DIIZINKAN = [56, 76, 112, 152, 160, 220, 320, 440];
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

/** Header cache: setahun, immutable — aman karena versi ikut di URL. */
const CACHE_HEADER = "public, max-age=31536000, immutable";

function balas(body: Buffer, mime: string, tambahan: Record<string, string> = {}) {
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(body.length),
      "Cache-Control": CACHE_HEADER,
      ...tambahan,
    },
  });
}

/**
 * Sajikan sampul buku.
 *
 * `lebar` 0 / tidak dikenal → sajikan berkas asli apa adanya (pratinjau admin,
 * tautan lama). Selain itu diperkecil ke WebP sesuai daftar lebar.
 *
 * Pengecilan dilakukan DI SINI, bukan lewat /_next/image: optimizer bawaan
 * Next mengambil gambar tanpa cookie sesi → rute ini membalas 401 → semua
 * sampul rusak (dibuktikan di browser: 20/20 broken). Dengan resize di rute
 * ini, cookie browser ikut terkirim dan HP hanya mengunduh versi kecil.
 */
export async function sajikanSampul(id: string, lebar: number, versi = "0"): Promise<Response> {
  const cover = await prisma.bookCover.findUnique({ where: { bookId: id } });
  if (!cover) throw new AppError("NOT_FOUND", "Sampul tidak ada", 404);

  const asli = Buffer.from(cover.bytes);

  // Tanpa lebar yang dikenal → sajikan apa adanya. Menjaga pratinjau admin,
  // tautan lama, dan pemakaian di tempat lain tetap utuh.
  if (!LEBAR_DIIZINKAN.includes(lebar)) {
    return balas(asli, cover.mime);
  }

  const kunci = `${id}:${versi}:${lebar}`;
  const tersimpan = cache.get(kunci);
  if (tersimpan) {
    return balas(tersimpan.body, tersimpan.mime, { "X-Sampul-Cache": "HIT" });
  }

  // Kalau sharp gagal (mis. libvips tak tersedia di image), JANGAN balas
  // error — kirim gambar asli. Sampul wajib tetap tampil; optimasi nomor dua.
  try {
    const hasil = await sharp(asli)
      .resize({ width: lebar, withoutEnlargement: true })
      .webp({ quality: KUALITAS })
      .toBuffer();
    simpanCache(kunci, hasil, "image/webp");
    return balas(hasil, "image/webp", { "X-Sampul-Cache": "MISS" });
  } catch (e) {
    console.error("[cover] resize gagal, kirim asli:", (e as Error).message);
    return balas(asli, cover.mime, { "X-Sampul-Cache": "FALLBACK" });
  }
}

export { MAX_BYTES, OK_MIME };
