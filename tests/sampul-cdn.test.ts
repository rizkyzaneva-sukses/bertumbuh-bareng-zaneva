import { describe, expect, it } from "vitest";
import { sampulCdn, LEBAR_SAMPUL, coverSrc } from "@/lib/cover";
import { LEBAR_DIIZINKAN } from "@/lib/sampul";

/**
 * Tes URL sampul — menutup bug NYATA yang terjadi dua kali:
 *
 * 1. `next/image` mengambil gambar tanpa cookie → rute sampul 401 → 20/20
 *    sampul rusak di browser. (Dikunci di tests/sampul.test.ts.)
 * 2. URL `?w=320` TIDAK berakhiran ekstensi berkas, sehingga Cloudflare
 *    mengabaikan `Cache-Control: public, immutable` dan semua permintaan
 *    sampul tetap menyeberang ke server (`cf-cache-status: DYNAMIC`). Diukur
 *    di live: 0 permintaan sampul dilayani dari cache tepi.
 *
 * Perbaikannya: URL berakhiran `.webp`, lebar+versi ditaruh di PATH. Tes ini
 * mengunci bentuk itu supaya optimasi tidak "hilang" lagi tanpa sadar.
 */
describe("URL sampul untuk CDN", () => {
  it("mengubah URL query lama menjadi PATH ber-ekstensi .webp", () => {
    const hasil = sampulCdn("/api/books/abc123/cover?v=1764000000000", "md");
    expect(hasil).toBe(`/api/books/abc123/cover/1764000000000/${160 * 2}.webp`);
  });

  it("setiap ukuran menghasilkan lebar 2× (layar HP DPR 2–3)", () => {
    for (const [size, lebar] of Object.entries(LEBAR_SAMPUL)) {
      const hasil = sampulCdn("/api/books/b1/cover?v=7", size);
      expect(hasil, `ukuran ${size}`).toContain(`/${lebar * 2}.webp`);
    }
  });

  it("lebar yang dihasilkan SELALU ada di daftar izin rute", () => {
    // Kalau salah satu ukuran tampilan memetakan ke lebar yang tidak diizinkan,
    // rute akan membalas 400 dan sampul di ukuran itu rusak di production.
    for (const size of Object.keys(LEBAR_SAMPUL)) {
      const lebar = LEBAR_SAMPUL[size] * 2;
      expect(LEBAR_DIIZINKAN, `ukuran ${size} → ${lebar}px`).toContain(lebar);
    }
  });

  it("URL tanpa ?v= tetap jadi bentuk sah (versi 0)", () => {
    expect(sampulCdn("/api/books/abc/cover", "xs")).toBe(`/api/books/abc/cover/0/${56 * 2}.webp`);
  });

  it("URL luar (openlibrary dsb.) TIDAK diubah", () => {
    const luar = "https://covers.openlibrary.org/b/id/123-L.jpg";
    expect(sampulCdn(luar, "md")).toBe(luar);
  });

  it("kosong / null → null, bukan URL rusak", () => {
    expect(sampulCdn("", "md")).toBeNull();
    expect(sampulCdn(null, "md")).toBeNull();
    expect(coverSrc("   ")).toBeNull();
  });

  it("hasil TIDAK memakai query string (itu penyebab cache CDN gagal)", () => {
    const hasil = sampulCdn("/api/books/abc/cover?v=5", "lg")!;
    expect(hasil).not.toContain("?");
    expect(hasil.endsWith(".webp")).toBe(true);
    // Versi wajib ikut di path, kalau tidak sampul baru memakai cache lama.
    expect(hasil).toContain("/5/");
  });

  it("id dengan karakter aneh tetap aman di URL", () => {
    const hasil = sampulCdn("/api/books/a b/cover?v=1", "md")!;
    expect(hasil).not.toContain(" ");
  });
});
