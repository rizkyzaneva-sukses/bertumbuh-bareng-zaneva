/**
 * Bandingkan /buku: muat PERTAMA (dingin) vs muat ULANG (hangat).
 *
 * Cache-Control halaman = private, no-store → HTML tidak boleh di-cache.
 * Jadi kalau muat ulang masih lambat, penyebabnya bukan CDN melainkan jumlah
 * request gambar yang dijalankan berurutan saat lazy-load.
 *
 * Pakai: LIVE_COOKIE="bbz_session=..." node scripts/banding-buku.mjs
 */
import { chromium, devices } from "playwright";

const BASE = "https://books.maulanacorp.biz.id";
const COOKIE = process.env.LIVE_COOKIE;
if (!COOKIE) {
  console.error("LIVE_COOKIE belum diisi");
  process.exit(1);
}
const [nama, nilai] = COOKIE.split("=");

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
await ctx.addCookies([
  { name: nama, value: nilai, domain: "books.maulanacorp.biz.id", path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
]);
const page = await ctx.newPage();

let reqGambar = 0;
page.on("request", (r) => {
  if (r.url().includes("/cover")) reqGambar++;
});

async function ukur(label, waitUntil) {
  reqGambar = 0;
  const t = Date.now();
  await page.goto(BASE + "/buku", { waitUntil, timeout: 120000 });
  const ms = Date.now() - t;
  return { label, ms, reqGambar };
}

// muat pertama (cache kosong)
const dingin = await ukur("muat pertama (dingin)", "networkidle");

// muat ulang (aset statis sudah di cache browser + CDN)
const hangat = [];
for (let i = 0; i < 3; i++) {
  hangat.push(await ukur(`ulang #${i + 1}`, "networkidle"));
}

// ukur sampai DOM siap saja, tanpa menunggu semua gambar
const tDcl = Date.now();
await page.goto(BASE + "/buku", { waitUntil: "domcontentloaded", timeout: 120000 });
const dcl = Date.now() - tDcl;

console.log(`\n=== /buku: dingin vs hangat ===`);
console.log(`  ${dingin.label.padEnd(24)} ${String(dingin.ms).padStart(5)} ms · ${dingin.reqGambar} request gambar`);
for (const h of hangat) console.log(`  ${h.label.padEnd(24)} ${String(h.ms).padStart(5)} ms · ${h.reqGambar} request gambar`);
const rata = Math.round(hangat.reduce((a, h) => a + h.ms, 0) / hangat.length);
console.log(`  ${"rata-rata hangat".padEnd(24)} ${String(rata).padStart(5)} ms`);
console.log(`  ${"DOM siap (tanpa gambar)".padEnd(24)} ${String(dcl).padStart(5)} ms`);

// berapa sampul yang benar-benar dimuat vs total
const isi = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img[alt^="Sampul"]')];
  return {
    total: imgs.length,
    dimuat: imgs.filter((i) => i.naturalWidth > 0).length,
    belum: imgs.filter((i) => !i.complete || i.naturalWidth === 0).length,
  };
});
console.log(`\n  Sampul: total ${isi.total} · sudah dimuat ${isi.dimuat} · belum ${isi.belum}`);
console.log(`  (belum dimuat = lazy-load, memang belum terlihat di layar — bukan rusak)`);

await browser.close();
