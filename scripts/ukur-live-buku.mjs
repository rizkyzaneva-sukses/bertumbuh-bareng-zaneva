/**
 * Ukur /buku LIVE beberapa kali (adil: ada pemanasan) + tangkapan layar
 * untuk memeriksa proporsi visual di layar HP.
 *
 * Pakai: LIVE_COOKIE="bbz_session=..." node scripts/ukur-live-buku.mjs
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
await page.goto(BASE + "/buku", { waitUntil: "networkidle", timeout: 120000 });

const kali = [];
for (let i = 0; i < 3; i++) {
  const t = Date.now();
  await page.goto(BASE + "/buku", { waitUntil: "networkidle", timeout: 120000 });
  kali.push(Date.now() - t);
  await page.waitForTimeout(500);
}

const tDcl = Date.now();
await page.goto(BASE + "/buku", { waitUntil: "domcontentloaded", timeout: 120000 });
const dcl = Date.now() - tDcl;

const metrik = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  const imgs = [...document.querySelectorAll('img[alt^="Sampul"]')];
  return {
    ttfb: nav ? Math.round(nav.responseStart) : null,
    domSelesai: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
    muatPenuh: nav ? Math.round(nav.loadEventEnd) : null,
    sampul: imgs.length,
    tampil: imgs.filter((i) => i.naturalWidth > 0).length,
    rusak: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
  };
});

// proporsi visual
const proporsi = await page.evaluate(() => {
  const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
  const tombol = [...document.querySelectorAll("button, a.btn")].slice(0, 12).map((b) => Math.round(b.getBoundingClientRect().height));
  const teksKecil = [...document.querySelectorAll("p, span, small")]
    .filter((e) => {
      const s = getComputedStyle(e);
      return parseFloat(s.fontSize) < 12 && e.textContent.trim().length > 3;
    })
    .length;
  return { overflow, tinggiTombolMin: Math.min(...tombol), teksKecil, lebarLayar: window.innerWidth };
});

console.log(`\n=== /buku LIVE ===`);
console.log(`  Muat penuh (3x)  : ${kali.join(" ms, ")} ms`);
console.log(`  rata-rata        : ${Math.round(kali.reduce((a, b) => a + b, 0) / kali.length)} ms`);
console.log(`  DOM siap         : ${dcl} ms`);
console.log(`  TTFB             : ${metrik.ttfb} ms`);
console.log(`  Sampul           : ${metrik.sampul} · tampil ${metrik.tampil} · RUSAK ${metrik.rusak}`);
console.log(`\n  Proporsi visual (layar ${proporsi.lebarLayar}px):`);
console.log(`    overflow horizontal : ${proporsi.overflow ? "❌ ADA" : "✅ tidak ada"}`);
console.log(`    tombol terpendek    : ${proporsi.tinggiTombolMin}px ${proporsi.tinggiTombolMin >= 44 ? "✅" : "⚠️ <44px"}`);
console.log(`    teks < 12px         : ${proporsi.teksKecil}`);

await page.screenshot({ path: OUT + "live-buku-setelah.png", fullPage: false });
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.screenshot({ path: OUT + "live-beranda-setelah.png", fullPage: false });

console.log(`\n  screenshot: ${OUT}live-buku-setelah.png, live-beranda-setelah.png`);
await browser.close();
