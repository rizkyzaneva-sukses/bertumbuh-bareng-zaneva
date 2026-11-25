/**
 * Ukur kapan SAMPUL PERTAMA benar-benar terlihat pengguna.
 *
 * Pengukuran sebelumnya membaca viewport tepat saat `load` event, ketika layout
 * belum stabil sehingga melaporkan 0 sampul di layar — itu artefak pengukuran,
 * bukan bug. Di sini kita POLL tiap 50 ms sampai sampul pertama muncul.
 *
 * Pakai: LIVE_COOKIE="bbz_session=..." node scripts/ukur-sampul-pertama.mjs
 */
import { chromium, devices } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://books.maulanacorp.biz.id";
const COOKIE = process.env.LIVE_COOKIE;
if (!COOKIE) {
  console.error("LIVE_COOKIE belum diisi");
  process.exit(1);
}
const [nama, nilai] = COOKIE.split("=");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "screens") + path.sep;

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
await ctx.addCookies([
  { name: nama, value: nilai, domain: "books.maulanacorp.biz.id", path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
]);
const page = await ctx.newPage();

// pemanasan
await page.goto(BASE + "/buku", { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(800);

// ---- ukur waktu sampai sampul pertama terlihat ----
const t = Date.now();
await page.goto(BASE + "/buku", { waitUntil: "commit", timeout: 120000 });

let waktuSampul = null;
let waktuTeks = null;
for (let i = 0; i < 200; i++) {
  const s = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img[alt^="Sampul"]')];
    const terlihat = imgs.filter((im) => {
      if (im.naturalWidth === 0) return false;
      const r = im.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0 && r.width > 0;
    });
    return {
      sampul: terlihat.length,
      teks: document.body.innerText.trim().length > 50,
    };
  });
  if (waktuTeks === null && s.teks) waktuTeks = Date.now() - t;
  if (s.sampul > 0) { waktuSampul = Date.now() - t; break; }
  await page.waitForTimeout(50);
}

console.log(`\n=== PENGALAMAN PENGGUNA /buku ===`);
console.log(`  Teks muncul        : ${waktuTeks ?? ">10s"} ms`);
console.log(`  Sampul 1 terlihat  : ${waktuSampul ?? "TIDAK MUNCUL"} ms`);

// ---- keadaan akhir setelah tenang ----
await page.waitForTimeout(2500);
const akhir = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img[alt^="Sampul"]')];
  return {
    total: imgs.length,
    tampil: imgs.filter((i) => i.naturalWidth > 0).length,
    rusak: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    resolusi: imgs[0]?.naturalWidth ?? 0,
    tampilPx: imgs[0] ? Math.round(imgs[0].getBoundingClientRect().width) : 0,
  };
});
console.log(`\n  Sampul total       : ${akhir.total}`);
console.log(`  Sudah tampil       : ${akhir.tampil} ${akhir.rusak === 0 ? "✅" : ""}`);
console.log(`  RUSAK              : ${akhir.rusak} ${akhir.rusak === 0 ? "✅" : "❌"}`);
console.log(`  Resolusi           : ${akhir.resolusi}px untuk tampilan ${akhir.tampilPx}px`);

await page.screenshot({ path: OUT + "live-buku-cloudflare.png" });
await page.goto(BASE + "/", { waitUntil: "load" });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + "live-beranda-cloudflare.png" });
console.log(`\n  screenshot: ${OUT}`);

await browser.close();
