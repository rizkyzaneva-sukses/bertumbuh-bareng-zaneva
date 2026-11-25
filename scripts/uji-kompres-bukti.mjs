/**
 * Uji kompresi foto bukti DI BROWSER SUNGGUHAN.
 *
 * Alasan file ini ada: hasil kompresi tidak bisa dibuktikan dengan tes unit
 * Node, karena `canvas` dan `createImageBitmap` hanya ada di browser. Yang
 * diuji di sini adalah klaim utama ke Bos — "image kepress biar ga menuhin
 * space" — dengan angka nyata dari Chromium.
 *
 * Jalankan: node scripts/uji-kompres-bukti.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

// Modul di-TRANSPILE dulu oleh tsc, bukan dengan regex. Regex pada TypeScript
// rapuh — sudah pernah gagal di anotasi tipe. Skrip ini menjalankan tsc sendiri
// supaya yang diuji persis kode yang dipakai app.
const asal = path.resolve("src/lib/proof-image.ts");
const dirKeluar = path.resolve(".uji-proof-js");
execSync(
  `npx tsc --ignoreConfig "${asal}" --target es2022 --module es2022 ` +
    `--moduleResolution bundler --outDir "${dirKeluar}" --skipLibCheck`,
  { stdio: "pipe" },
);
// Buang `export` supaya bisa ditempel sebagai fungsi biasa di halaman uji.
const kode = readFileSync(path.join(dirKeluar, "proof-image.js"), "utf8").replace(/^export /gm, "");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("about:blank");

const hasil = await page.evaluate(async (kode) => {
  // Jalankan modul di konteks halaman.
  const f = new Function(`${kode}; return { kompresFoto, PROOF_MAX_SIDE, PROOF_QUALITY };`);
  const { kompresFoto, PROOF_MAX_SIDE, PROOF_QUALITY } = f();

  // Bikin gambar uji 3024x4032 (setara foto 12MP) berisi pola berisik, supaya
  // ukuran JPEG-nya realistis dan bukan cuma bidang warna polos.
  const W = 3024, H = 4032;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const p = i / 4;
    const x = p % W, y = (p / W) | 0;
    const v = 110 + ((x * 37 + y * 17) % 90) + ((p * 2654435761) % 23);
    img.data[i] = v % 256;
    img.data[i + 1] = (v * 0.93) % 256;
    img.data[i + 2] = (v * 0.8) % 256;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const blobAsli = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
  const file = new File([blobAsli], "foto-hp.jpg", { type: "image/jpeg" });

  const t0 = performance.now();
  const out = await kompresFoto(file);
  const ms = Math.round(performance.now() - t0);

  return {
    asliByte: blobAsli.size,
    hasilByte: out.blob.size,
    width: out.width,
    height: out.height,
    ms,
    mime: out.blob.type,
    maxSide: PROOF_MAX_SIDE,
    quality: PROOF_QUALITY,
  };
}, kode);

await browser.close();

const kb = (n) => (n / 1024).toFixed(0) + " KB";
const mb = (n) => (n / 1024 / 1024).toFixed(2) + " MB";
const rasio = (hasil.asliByte / hasil.hasilByte).toFixed(1);

console.log("=== UJI KOMPRESI FOTO BUKTI (Chromium) ===");
console.log(`Masuk  : ${mb(hasil.asliByte)} (3024x4032, setara foto 12MP)`);
console.log(`Keluar : ${kb(hasil.hasilByte)} (${hasil.width}x${hasil.height}, ${hasil.mime})`);
console.log(`Rasio  : ${rasio}x lebih kecil`);
console.log(`Waktu  : ${hasil.ms} ms di HP/komputer`);
console.log(`Setting: sisi maks ${hasil.maxSide}px, JPEG q${hasil.quality}`);

// Penjaga: kalau suatu hari parameternya diubah dan hasilnya membengkak,
// uji ini gagal — bukan diam-diam menuhin space.
const gagal = [];
if (hasil.hasilByte > 400 * 1024) gagal.push(`hasil ${kb(hasil.hasilByte)} > 400 KB`);
if (Math.max(hasil.width, hasil.height) !== hasil.maxSide) gagal.push("sisi terpanjang tidak 1200px");
if (hasil.mime !== "image/jpeg") gagal.push("bukan JPEG");
if (hasil.asliByte / hasil.hasilByte < 4) gagal.push("kompresi kurang dari 4x");

if (gagal.length) {
  console.log("\nGAGAL: " + gagal.join(" · "));
  process.exit(1);
}
console.log("\nLOLOS: foto 12MP dikecilkan jadi ratusan KB, bukan MB.");
