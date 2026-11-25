/**
 * Ukur byte sampul NYATA di browser bersesi login:
 * file mentah (tanpa ?w=) vs versi kecil yang benar-benar diunduh.
 */
import { chromium, devices } from "playwright";

const BASE = "http://localhost:3100";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();

await page.goto(BASE + "/login");
await page.waitForSelector("#phone");
await page.fill("#phone", "6281220210193");
await page.fill("#password", "Zaneva2026");
await page.click('button[type="submit"]');
await page.waitForTimeout(3500);

// scroll agar lazy-load semua sampul terpicu
await page.goto(BASE + "/buku", { waitUntil: "networkidle" });
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => window.scrollBy(0, window.innerHeight));
  await page.waitForTimeout(400);
}
await page.waitForTimeout(1500);

const daftar = await page.evaluate(() =>
  [...document.querySelectorAll('img[alt^="Sampul"]')].map((i) => ({
    src: i.getAttribute("src"),
    current: i.currentSrc || i.src,
    natural: i.naturalWidth,
    tampil: Math.round(i.getBoundingClientRect().width),
  })),
);

const terlihat = daftar.filter((d) => d.natural > 0);
console.log(`Elemen sampul: ${daftar.length} · berhasil dimuat: ${terlihat.length}`);
console.log(`Lebar tampil: ${daftar[0]?.tampil}px · resolusi gambar: ${daftar[0]?.natural}px\n`);

let mentah = 0;
let opt = 0;
let n = 0;
let tipeOpt = "";
for (const d of terlihat) {
  const tanpaW = (d.src || "").replace(/[&?]w=\d+/, "");
  if (!tanpaW) continue;
  const r1 = await page.request.get(BASE + tanpaW);
  if (r1.status() !== 200) continue;
  mentah += (await r1.body()).length;
  const r2 = await page.request.get(BASE + d.src);
  opt += (await r2.body()).length;
  tipeOpt = r2.headers()["content-type"] ?? tipeOpt;
  n++;
}

if (n > 0) {
  const kb = (x) => (x / 1024).toFixed(1) + " KB";
  console.log(`Byte sampul (${n} gambar)`);
  console.log(`  mentah (asli)   : ${kb(mentah)}`);
  console.log(`  teroptimasi     : ${kb(opt)}  (${tipeOpt})`);
  console.log(`  HEMAT           : ${kb(mentah - opt)}  → ${Math.round((1 - opt / mentah) * 100)}% lebih ringan`);
  console.log(`  per sampul      : ${kb(mentah / n)} → ${kb(opt / n)}`);
  console.log(`  setara          : ${(mentah / opt).toFixed(1)}× lebih kecil`);
} else {
  console.log("⚠️ tidak ada sampul yang bisa diukur");
}

await browser.close();
