/**
 * Ukur perbandingan NYATA di live: file mentah vs WebP untuk sampul yang SAMA.
 * Juga laporkan request yang tidak 200 (mis. 302) beserta URL-nya.
 *
 * Pakai: LIVE_COOKIE="bbz_session=..." node scripts/ukur-live-banding.mjs
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

const bukan200 = [];
page.on("response", async (r) => {
  if (r.url().includes("/cover") && r.status() !== 200) {
    bukan200.push({ status: r.status(), url: r.url().slice(0, 130), loc: r.headers()["location"] ?? "-" });
  }
});

await page.goto(BASE + "/buku", { waitUntil: "networkidle", timeout: 90000 });
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.scrollBy(0, window.innerHeight));
  await page.waitForTimeout(350);
}
await page.waitForTimeout(2000);

const daftar = await page.evaluate(() =>
  [...document.querySelectorAll('img[alt^="Sampul"]')]
    .filter((i) => i.naturalWidth > 0)
    .map((i) => ({ src: i.getAttribute("src"), resolusi: i.naturalWidth })),
);

// Sampul milik app (bisa dioptimasi) vs URL luar (tidak bisa).
const milikApp = daftar.filter((d) => d.src && d.src.startsWith("/api/books/"));
const luar = daftar.filter((d) => d.src && !d.src.startsWith("/api/books/"));

console.log(`Sampul terlihat: ${daftar.length} (milik app: ${milikApp.length}, URL luar: ${luar.length})\n`);

// Laporkan URL luar yang bentuknya meragukan (mis. "https//" tanpa titik dua).
const aneh = luar.filter((d) => !/^https?:\/\//.test(d.src));
if (aneh.length) {
  console.log(`⚠️ ${aneh.length} sampul memakai URL luar TIDAK VALID (bukan http:// atau https://):`);
  for (const a of aneh.slice(0, 5)) console.log(`   ${a.src}`);
  console.log("   → ini data di DB, bukan bug kode. Perlu dibetulkan/dihapus lewat admin.\n");
}

let mentah = 0;
let webp = 0;
let n = 0;
for (const d of milikApp) {
  const tanpaW = d.src.replace(/([&?])w=\d+/, "");
  const r1 = await page.request.get(BASE + tanpaW);
  if (r1.status() !== 200) continue;
  const b1 = Buffer.from(await r1.body());
  const r2 = await page.request.get(BASE + d.src);
  if (r2.status() !== 200) continue;
  const b2 = Buffer.from(await r2.body());
  mentah += b1.length;
  webp += b2.length;
  n++;
}

const kb = (x) => (x / 1024).toFixed(1) + " KB";
if (n > 0) {
  console.log(`Perbandingan untuk ${n} sampul YANG SAMA (diukur di live):`);
  console.log(`  file asli (tanpa ?w=) : ${kb(mentah)}`);
  console.log(`  WebP yang dikirim HP  : ${kb(webp)}`);
  console.log(`  HEMAT                 : ${kb(mentah - webp)} → ${Math.round((1 - webp / mentah) * 100)}%`);
  console.log(`  rasio                 : ${(mentah / webp).toFixed(1)}× lebih kecil`);
  console.log(`  per sampul            : ${kb(mentah / n)} → ${kb(webp / n)}`);
} else {
  console.log("tidak ada sampul yang bisa dibandingkan");
}

if (bukan200.length) {
  console.log(`\nRequest sampul yang BUKAN 200 (${bukan200.length}):`);
  for (const b of bukan200) console.log(`  ${b.status} → ${b.url}\n       location: ${b.loc}`);
}

await browser.close();
