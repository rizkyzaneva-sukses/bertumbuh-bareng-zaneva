import { handler, fail } from "@/lib/http";
import { sajikanSampul, LEBAR_DIIZINKAN } from "@/lib/sampul";

/**
 * Rute sampul BER-EKSTENSI — jalur utama rak buku.
 *
 *   /api/books/<id>/cover/<versi>/<lebar>.webp
 *
 * Kenapa bentuknya begitu, bukan `?w=320` seperti dulu:
 * Cloudflare hanya mau menyimpan respons di cache tepi kalau URL berakhiran
 * ekstensi berkas statis. Dengan `?w=`, header `Cache-Control: public,
 * immutable` diabaikan dan SEMUA permintaan tetap menyeberang ke server
 * (`cf-cache-status: DYNAMIC`). Berkas `.webp` → Cloudflare menyimpannya, dan
 * permintaan berikutnya dilayani dari tepi tanpa menyentuh server.
 *
 * (Next.js tidak mengizinkan folder dinamis bernama `[lebar].webp`, karena itu
 * dipakai catch-all lalu nama berkasnya diurai manual di sini.)
 *
 * `allowMustChange: true` — sama seperti rute lama: sampul harus tetap tampil
 * walau modal onboarding menutupi app.
 */
export const GET = handler<{ id: string; berkas: string[] }>(
  { allowMustChange: true },
  async (_req, { params }) => {
    // Bentuk yang diharapkan: ["<versi>", "<lebar>.webp"]
    if (params.berkas.length !== 2) return fail("Alamat sampul tidak dikenal", 404, "NOT_FOUND");

    const [versi, namaBerkas] = params.berkas;
    const cocok = /^(\d+)\.webp$/.exec(namaBerkas);
    if (!cocok) return fail("Alamat sampul tidak dikenal", 404, "NOT_FOUND");

    const lebar = Number(cocok[1]);
    // Tolak lebar di luar daftar SEBELUM menyentuh database: mencegah orang
    // membanjiri server dengan ?w=1..999 yang masing-masing memicu resize.
    if (!LEBAR_DIIZINKAN.includes(lebar)) return fail("Lebar sampul tidak diizinkan", 400, "LEBAR");

    return sajikanSampul(params.id, lebar, versi);
  },
);
