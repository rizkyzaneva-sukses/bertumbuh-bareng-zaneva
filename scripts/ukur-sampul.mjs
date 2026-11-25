/** Ukur waktu tiap permintaan sampul — cari penyebab /buku lambat. */
import { chromium, devices } from "playwright";

const BASE = process.env.BASE ?? "https://books.maulanacorp.biz.id";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "id-ID" });
const page = await ctx.newPage();

const waktu = [];
page.on("requestfinished", async (r) => {
  const u = r.url();
  if (!u.includes("/cover")) return;
  const t = r.timing();
  const selesai = t.responseEnd; // ms sejak request mulai
  const bytes = Number(r.headers()["content-length"] ?? 0);
  waktu.push({ selesai: Math.round(selesai), bytes });
});

await page.goto(BASE + "/login");
await page.waitForSelector("#phone", { timeout: 30000 });
await page.fill("#phone", process.env.LIVE_PHONE ?? "081220210193");
await page.fill("#password", process.env.LIVE_PASS);
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);

const t0 = Date.now();
await page.goto(BASE + "/buku", { waitUntil: "networkidle", timeout: 60000 });
console.log(`/buku (networkidle): ${Date.now() - t0} ms`);
console.log(`Permintaan sampul: ${waktu.length}`);

waktu.sort((a, b) => b.selesai - a.selesai);
console.log("\nSampul paling lambat (ms sejak request mulai):");
for (const w of waktu.slice(0, 8)) console.log(`  ${String(w.selesai).padStart(6)} ms  ${w.bytes} B`);

const total = waktu.reduce((s, w) => s + w.selesai, 0);
const rata = waktu.length ? total / waktu.length : 0;
console.log(`\nRata-rata ${rata.toFixed(0)} ms/sampul · total ${total} ms kalau dijalankan berurutan`);

// Bandingkan: 1 request sampul langsung, berulang
const id = await page.evaluate(() => document.querySelector("img")?.src ?? "");
if (id) {
  console.log("\nUji langsung 5× ambil satu sampul yang sama:");
  const hasil = [];
  for (let i = 0; i < 5; i++) {
    const s = Date.now();
    const r = await page.request.get(id);
    hasil.push(Date.now() - s);
    await r.body();
  }
  console.log(`  ${hasil.join(" ms, ")} ms`);
  console.log(`  → kalau 5 request sama selesai cepat tapi halaman 6 detik,`);
  console.log(`    penyebabnya bukan sampul, melainkan query halaman / serialisasi.`);
}

await browser.close();
