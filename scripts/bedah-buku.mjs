/**
 * Bedah sisa waktu /buku: ke mana 2,2 detik itu pergi?
 *
 * DOM siap hanya ~480 ms, jadi 1,7 detik sisanya bukan HTML.
 * Skrip ini mengelompokkan resource timing: HTML, JS chunk, gambar, font, lain.
 *
 * Pakai: LIVE_COOKIE="bbz_session=..." node scripts/bedah-buku.mjs
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

// muat dua kali: yang kedua sudah hangat (aset dari cache), seperti pemakaian nyata
await page.goto(BASE + "/buku", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(800);

const t = Date.now();
await page.goto(BASE + "/buku", { waitUntil: "networkidle", timeout: 120000 });
const total = Date.now() - t;

const bedah = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  const res = performance.getEntriesByType("resource");

  const kel = { html: [], js: [], css: [], gambar: [], font: [], lain: [] };
  for (const r of res) {
    const nama = r.name;
    const o = { nama: nama.split("/").pop()?.slice(0, 40) ?? "?", durasi: Math.round(r.duration), mulai: Math.round(r.startTime), byte: r.transferSize || 0 };
    if (nama.includes("/cover") || /\.(jpg|jpeg|png|webp|avif|svg)/.test(nama)) kel.gambar.push(o);
    else if (nama.includes("/_next/static") && nama.includes(".js")) kel.js.push(o);
    else if (nama.endsWith(".css")) kel.css.push(o);
    else if (/\.(woff2?|ttf|otf)/.test(nama)) kel.font.push(o);
    else kel.lain.push(o);
  }

  const jumlah = (a) => a.length;
  const totalByte = (a) => a.reduce((s, x) => s + x.byte, 0);
  const terlama = (a) => (a.length ? Math.round(Math.max(...a.map((x) => x.mulai + x.durasi))) : 0);

  return {
    nav: {
      ttfb: Math.round(nav.responseStart),
      dcl: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd),
      renderBlocking: Math.round(nav.domContentLoadedEventStart),
      protocol: nav.nextHopProtocol,
    },
    ringkas: Object.entries(kel).map(([k, v]) => ({
      jenis: k,
      jumlah: jumlah(v),
      kb: +(totalByte(v) / 1024).toFixed(1),
      selesaiPada: terlama(v),
    })),
  };
});

console.log(`\n=== BEDAH /buku (muat hangat) ===`);
console.log(`  Total terukur      : ${total} ms`);
console.log(`  Protokol           : ${bedah.nav.protocol}`);
console.log(`  TTFB (HTML)        : ${bedah.nav.ttfb} ms`);
console.log(`  DOM siap           : ${bedah.nav.dcl} ms`);
console.log(`  Load penuh         : ${bedah.nav.load} ms`);

console.log(`\n  Rincian per jenis resource:`);
console.log(`  ${"jenis".padEnd(8)} ${"jml".padStart(4)} ${"ukuran".padStart(10)} ${"selesai pd".padStart(12)}`);
for (const r of bedah.ringkas) {
  console.log(`  ${r.jenis.padEnd(8)} ${String(r.jumlah).padStart(4)} ${String(r.kb + " KB").padStart(10)} ${String(r.selesaiPada + " ms").padStart(12)}`);
}

await browser.close();
