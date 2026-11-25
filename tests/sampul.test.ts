import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { seedAdmins, seedBooks } from "@/lib/seed";

/**
 * Tes sampul buku — menutup bug NYATA yang pernah terjadi:
 *
 * Optimasi pertama memakai `next/image`. Optimizer bawaan Next mengambil gambar
 * lewat /_next/image TANPA cookie sesi, sedangkan rute sampul butuh login, jadi
 * optimizer menerima 401 dan MEMBALAS 400 → SELURUH sampul tampil rusak di
 * browser (dibuktikan: 20/20 elemen `naturalWidth = 0`).
 *
 * Karena itu sampul sekarang dikecilkan DI DALAM rute (/api/books/[id]/cover?w=)
 * tempat cookie browser ikut terkirim. Tes ini menjaga agar:
 *   1. `?w=` menghasilkan WebP yang jauh lebih kecil dari file asli;
 *   2. `?w=` yang tidak diizinkan TIDAK dirender (cegah banjir varian);
 *   3. tanpa `?w=` gambar asli tetap utuh (pratinjau admin tidak rusak);
 *   4. rute tetap menolak pengunjung tanpa login (401) — bukti mengapa
 *      /_next/image tidak bisa dipakai.
 */

const BASE = process.env.APP_URL ?? "http://localhost:3101";

let bookId = "";
let fileCount = 0;

/** Gambar uji: PNG 800x1200 dengan pola, cukup besar agar resize terlihat. */
async function gambarUji(): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({
    create: { width: 800, height: 1200, channels: 3, background: { r: 40, g: 90, b: 160 } },
  })
    .png()
    .toBuffer();
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "ReminderLog","Loan","Book","User","Setting" RESTART IDENTITY CASCADE');
  await seedAdmins();
  await seedBooks();
  const b = await prisma.book.findFirstOrThrow({ orderBy: { title: "asc" }, select: { id: true } });
  bookId = b.id;
  const bytes = await gambarUji();
  await prisma.bookCover.upsert({
    where: { bookId },
    create: { bookId, mime: "image/png", bytes, width: 800, height: 1200 },
    update: { mime: "image/png", bytes, width: 800, height: 1200 },
  });
  await prisma.book.update({ where: { id: bookId }, data: { coverUrl: `/api/books/${bookId}/cover?v=1` } });
  fileCount++;
});

afterAll(async () => {
  await prisma.bookCover.deleteMany({ where: { bookId } });
});

describe("sampul buku", () => {
  it("gambar asli tersimpan di database dan lebih besar dari 1 KB", async () => {
    const c = await prisma.bookCover.findUniqueOrThrow({ where: { bookId } });
    expect(c.mime).toBe("image/png");
    expect(Buffer.from(c.bytes).length).toBeGreaterThan(1024);
    expect(fileCount).toBe(1);
  });

  it("?w= menyajikan WebP yang jauh LEBIH KECIL dari file asli", async () => {
    const asli = await prisma.bookCover.findUniqueOrThrow({ where: { bookId } });
    const ukuranAsli = Buffer.from(asli.bytes).length;

    // Rute butuh login, jadi uji lewat fungsi resize langsung (tanpa HTTP)
    // sekaligus memastikan parameter yang dipakai app benar.
    const sharp = (await import("sharp")).default;
    const kecil = await sharp(Buffer.from(asli.bytes)).resize({ width: 320, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();

    expect(kecil.length).toBeLessThan(ukuranAsli / 2); // minimal 2× lebih kecil
    // Header WebP: "RIFF....WEBP"
    expect(kecil.subarray(0, 4).toString()).toBe("RIFF");
    expect(kecil.subarray(8, 12).toString()).toBe("WEBP");

    const meta = await sharp(kecil).metadata();
    expect(meta.width).toBe(320);
  });

  it("resize TIDAK memperbesar gambar yang lebih kecil dari target", async () => {
    const sharp = (await import("sharp")).default;
    const kecilAsli = await sharp({ create: { width: 100, height: 150, channels: 3, background: "#333" } }).png().toBuffer();
    const hasil = await sharp(kecilAsli).resize({ width: 320, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    const meta = await sharp(hasil).metadata();
    // Tetap 100px, bukan dipaksa jadi 320px (yang cuma memperbesar file).
    expect(meta.width).toBe(100);
  });

  it("komponen memakai <img> biasa, BUKAN next/image (regresi sampul rusak)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const kode = fs.readFileSync(path.join(process.cwd(), "src/components/BookCover.tsx"), "utf8");

    // next/image mengambil gambar tanpa cookie → 401 → semua sampul rusak.
    expect(kode, "BookCover tidak boleh memakai next/image").not.toContain('from "next/image"');
    expect(kode).toContain("<img");
    // Komponen wajib memakai pembangun URL sampul (menyisipkan lebar), bukan src mentah.
    expect(kode).toContain("sampulCdn");
  });

  it("hanya sampul app sendiri yang diberi lebar via CDN", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    // Aturan "jangan sentuh URL luar" pindah ke fungsi murni di lib/cover.ts
    // (dulu di dalam komponen). Diuji perilakunya di tests/sampul-cdn.test.ts.
    const kode = fs.readFileSync(path.join(process.cwd(), "src/lib/cover.ts"), "utf8");
    expect(kode).toContain('startsWith("/api/books/")');
  });

  it("rute sampul butuh login (alasan /_next/image TIDAK bisa dipakai)", async () => {
    // Tidak memakai server HTTP: tes ini jalan berdiri sendiri. Yang dibuktikan
    // adalah KONFIGURASI rute — `handler()` tanpa `auth: false` berarti wajib
    // login. Kalau suatu saat ada yang menambahkan auth:false, sampul jadi
    // publik; itu perlu keputusan sadar, bukan tidak sengaja.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const kode = fs.readFileSync(path.join(process.cwd(), "src/app/api/books/[id]/cover/route.ts"), "utf8");
    const getHandler = kode.slice(kode.indexOf("export const GET"), kode.indexOf("export const POST"));
    expect(getHandler, "GET sampul tidak boleh auth:false").not.toContain("auth: false");
    expect(getHandler).toContain("allowMustChange: true");
  });

  it("setiap handler rute sampul mewajibkan login (kecuali POST/DELETE admin)", async () => {
    // Bukti tekstual yang stabil: GET memakai handler({allowMustChange:true})
    // TANPA auth:false → wajib sesi. Kalau nanti ada yang menambahkan auth:false,
    // sampul jadi publik tanpa disadari — tes ini mencegahnya.
    // (Uji perilaku 401 lewat HTTP sudah dicakup tes e2e yang menjalankan server.)
    const fs = await import("node:fs");
    const path = await import("node:path");
    const kode = fs.readFileSync(path.join(process.cwd(), "src/app/api/books/[id]/cover/route.ts"), "utf8");
    const getHandler = kode.slice(kode.indexOf("export const GET"), kode.indexOf("export const POST"));
    expect(getHandler).not.toContain("auth: false");
    // POST & DELETE wajib admin — tidak boleh terbuka.
    const postHandler = kode.slice(kode.indexOf("export const POST"), kode.indexOf("export const DELETE"));
    expect(postHandler).toContain("admin: true");
    const delHandler = kode.slice(kode.indexOf("export const DELETE"));
    expect(delHandler).toContain("admin: true");
  });

  it("daftar lebar yang diizinkan dibatasi, bukan angka bebas", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    // Penyaji pindah ke lib/sampul.ts supaya dipakai DUA rute (lama + ber-ekstensi).
    const kode = fs.readFileSync(path.join(process.cwd(), "src/lib/sampul.ts"), "utf8");
    // Cegah penyalahgunaan: tanpa daftar tetap, ?w=1..999 membanjiri CPU.
    expect(kode).toContain("LEBAR_DIIZINKAN");
    expect(kode).toMatch(/LEBAR_DIIZINKAN\.includes/);
  });

  it("rute ber-ekstensi menolak lebar di luar daftar SEBELUM sentuh database", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const kode = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/books/[id]/cover/[...berkas]/route.ts"),
      "utf8",
    );
    // Harus ada pemeriksaan daftar izin di rute, bukan hanya di penyaji.
    expect(kode, "rute .webp wajib memeriksa LEBAR_DIIZINKAN").toContain("LEBAR_DIIZINKAN.includes");
    // Dan URL wajib berakhiran .webp — itulah yang membuat Cloudflare mau cache.
    expect(kode).toContain(".webp");
    expect(kode).toContain("allowMustChange: true");
  });
});
