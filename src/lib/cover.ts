/**
 * Sampul buku di rak.
 *
 * Bos: *"Biar bukunya terlihat bagus di app, tambahin cover dong jadi bukan text
 * judul aja. Sistemnya kaya storefront jualan."*
 *
 * Dua jalur:
 *  1. `coverUrl` terisi (unggahan admin atau URL publik) → gambar asli.
 *  2. Kosong → **sampul generatif**: tipografi + warna khas kategori, tetap
 *     terlihat seperti buku di toko, bukan label teks polos.
 *
 * File ini MURNI (tanpa JSX, tanpa "use client") supaya boleh dipakai server
 * component, client component, dan seed sekaligus.
 */

export type CoverTheme = {
  /** Gradien latar (atas → bawah). */
  a: string;
  b: string;
  /** Warna teks judul/penulis yang kontras di atas gradien. */
  ink: string;
  /** Warna aksen motif geometris. */
  acc: string;
  /** Sudut gradien — ikut divariasikan supaya tidak terlihat satu cetakan. */
  deg: number;
};

/**
 * Basis warna per kategori (hue, saturasi, lightness).
 *
 * PALET INI HANYA TITIK AWAL: `coverTheme()` menggeser hue/lightness per buku
 * memakai hash id, karena hasil percobaan pertama — satu kategori satu warna —
 * membuat 11 buku "Produktivitas" tampak seperti 11 salinan buku yang sama.
 */
const BASE: Record<string, [number, number, number]> = {
  Produktivitas: [222, 42, 17],
  "Berpikir & Kreativitas": [172, 58, 14],
  "Kepemimpinan & Tim": [350, 55, 19],
  "Pemasaran & Pelanggan": [20, 70, 20],
  Operasional: [208, 30, 21],
  "Bisnis & Strategi": [158, 46, 16],
  Keuangan: [140, 44, 14],
  Spiritual: [163, 52, 14],
  Parenting: [335, 40, 21],
  "Pengembangan Diri": [268, 38, 18],
  Fiksi: [349, 40, 19],
  Komik: [214, 62, 24],
  Biografi: [32, 42, 18],
  Lainnya: [34, 8, 19],
};

/** Aksen cerah yang dipakai bergiliran — inilah yang membuat rak berwarna. */
const ACCENTS = [
  "#e0b451", // emas
  "#4fd1a5", // mint
  "#e0705f", // terakota
  "#ffa24b", // oranye
  "#8fb3d1", // biru langit
  "#9ad36f", // hijau limau
  "#d9c27a", // kuning tua
  "#f0a8b8", // rose
  "#b79ce0", // lavender
  "#6ec2a0", // teal
  "#ffd166", // kuning
  "#e88a8a", // salmon
];

/**
 * Hash stabil 32-bit dengan avalanche (FNV-1a + finalizer murmur3).
 *
 * FNV-1a saja TIDAK cukup di sini: bit-bit rendahnya lemah untuk string
 * sepanjang/berkemiripan sama (id buku `bbzbook0101`…`bbzbook0117`), sehingga
 * `(h >> 5) % 4` jatuh ke nilai yang sama terus — hasilnya 32 dari 37 sampul
 * tampil "gaya gelap" padahal maksudnya dibagi rata. Finalizer menyebarkan bit
 * atas ke bawah supaya pilihan gaya/motif benar-benar bervariasi.
 */
export function seedHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Bilangan 0…n-1 dari hash, memakai bit ATAS (paling teracak). */
function pick(h: number, n: number): number {
  return Math.floor((h / 0x100000000) * n) % n;
}

const hsl = (h: number, s: number, l: number) => `hsl(${((h % 360) + 360) % 360} ${Math.max(0, Math.min(100, s))}% ${Math.max(4, Math.min(92, l))}%)`;

/**
 * Tema per buku: kategori memberi keluarga warna, hash id memberi variasi
 * hue/lightness/sudut + aksen.
 *
 * Percobaan pertama hanya menggeser hue ±20° di sekitar satu warna kategori —
 * hasilnya 10 dari 11 buku "Produktivitas" tetap tampak seperti salinan buku
 * yang sama (ketahuan dari screenshot saya sendiri). Sekarang pergeseran hue
 * jauh lebih lebar DAN tiap buku dapat salah satu dari empat "gaya cetak":
 * gelap pekat, terang krem, sedang berwarna, atau solid tegas. Itu yang membuat
 * rak terbaca sebagai kumpulan buku berbeda, bukan satu desain diulang.
 */
export function coverTheme(category: string, id = ""): CoverTheme {
  const [h0, s0, l0] = BASE[category] ?? BASE.Lainnya;
  const h1 = seedHash(id || category);
  const h2 = seedHash(`${id}:2`);
  // Sebaran hue lebar: satu kategori boleh menyimpang jauh, asal tetap hangat/
  // sejuk senada. Dulu ±20° → 10 dari 11 buku "Produktivitas" tampak identik.
  const hue = h0 + (pick(h1, 161) - 80); // −80…+80°
  const deg = 150 + pick(h2, 5) * 22; // 150/172/194/216/238°
  const acc = ACCENTS[pick(h1 ^ 0x5bf03635, ACCENTS.length)];

  // Gaya cetak dibagi rata lewat hash yang sudah di-avalanche:
  // 0 gelap pekat, 1 terang krem, 2 sedang berwarna, 3 solid tegas.
  const style = pick(h2, 4);

  if (style === 1) {
    const tint = hsl(hue, Math.max(12, s0 - 20), 93);
    const tint2 = hsl(hue + 6, Math.max(10, s0 - 14), 85);
    return { a: tint, b: tint2, ink: hsl(hue, 48, 15), acc: hsl(hue, 62, 36), deg };
  }
  if (style === 2) {
    const mid = hsl(hue, Math.min(78, s0 + 22), 42);
    const mid2 = hsl(hue - 10, Math.min(78, s0 + 16), 30);
    return { a: mid, b: mid2, ink: "#fdf8ef", acc, deg };
  }
  if (style === 3) {
    const solid = hsl(hue, Math.min(86, s0 + 36), 34);
    return { a: solid, b: hsl(hue + 8, Math.min(86, s0 + 32), 24), ink: "#fffaf2", acc: "#f4e6c9", deg };
  }
  const top = hsl(hue, s0 + 8, l0 + 4);
  const bottom = hsl(hue - 8, s0 + 2, Math.max(6, l0 - 7));
  return { a: top, b: bottom, ink: "#f7f1e6", acc, deg };
}

/** Varian motif 0–5, dipilih deterministik dari id buku. */
export function coverPattern(id: string): number {
  return pick(seedHash(`${id}:pat`), 6);
}

/**
 * Ukuran judul (dalam `cqw` = persen lebar sampul).
 *
 * Dua batas, ambil yang PALING KECIL:
 *  1. berdasar panjang total judul (judul panjang = huruf kecil), dan
 *  2. berdasar **kata terpanjang** — ini yang dulu terlewat, sehingga
 *     "Essentialism" (12 huruf, satu kata) dicetak 16cqw lalu pecah jadi
 *     "Essentialis / m". Lebar isi sampul ±78cqw, jadi satu kata harus muat:
 *     `78 / (jumlah_huruf × 0.58)`.
 */
export function coverTitleSize(title: string): number {
  const t = title.trim();
  const n = t.length;
  const byTotal = n <= 14 ? 16 : n <= 22 ? 13.5 : n <= 32 ? 11.5 : n <= 46 ? 10 : n <= 64 ? 8.8 : 7.6;
  const longest = t.split(/[\s\-–—/]+/).reduce((m, w) => Math.max(m, w.length), 1);
  const byWord = 78 / (longest * 0.58);
  return Math.max(6.2, Math.min(byTotal, byWord));
}

/** Maksimal baris judul di sampul; sisanya dipotong dengan elipsis. */
export function coverTitleLines(title: string): number {
  return title.trim().length <= 22 ? 3 : title.trim().length <= 46 ? 4 : 5;
}

/** Pisahkan subjudul setelah titik dua untuk dipakai di sampul sempit. */
export function splitTitle(title: string): { main: string; sub: string } {
  const clean = title.replace(/\s+/g, " ").trim();
  const idx = clean.indexOf(":");
  if (idx > 6 && idx < clean.length - 8) {
    return { main: clean.slice(0, idx).trim(), sub: clean.slice(idx + 1).trim() };
  }
  return { main: clean, sub: "" };
}

/** URL gambar siap pakai. Path lokal (`/...`) dibiarkan, URL luar juga. */
export function coverSrc(coverUrl: string | null | undefined): string | null {
  const u = (coverUrl ?? "").trim();
  if (!u) return null;
  return u;
}

export const COVER_ASPECT = 2 / 3;
