/**
 * Ukur waktu muat tiap halaman di LIVE + apakah ada indikator loading.
 * Juga cek apakah navigasi terasa "diam" (tidak ada feedback).
 */
import { chromium, devices } from "playwright";

const BASE = process.env.BASE ?? "https://books.maulanacorp.biz.id";
const PASS = process.env.LIVE_PASS;

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "id-ID", timezoneId: "Asia/Jakarta" });
const page = await ctx.newPage();

const reqs = [];
page.on("response", (r) => {
  const u = r.url();
  if (u.startsWith(BASE)) reqs.push({ u: u.replace(BASE, ""), s: r.status(), t: r.request().timing().responseEnd });
});

await page.goto(BASE + "/login");
await page.waitForSelector("#phone", { timeout: 30000 });
await page.fill("#phone", process.env.LIVE_PHONE ?? "081220210193");
await page.fill("#password", PASS);
await page.click('button[type="submit"]');
await page.waitForTimeout(3500);

const halaman = ["/", "/buku", "/riwayat", "/dashboard", "/profil", "/panduan", "/admin/buku", "/admin/pengguna", "/admin/pinjaman"];
console.log("Halaman                          muat(ms)  dok(ms)  req  KB");
for (const h of halaman) {
  reqs.length = 0;
  const t0 = Date.now();
  const nav = await page.goto(BASE + h, { waitUntil: "networkidle", timeout: 45000 }).catch(() => null);
  const total = Date.now() - t0;
  const doc = nav ? await nav.request().timing().responseEnd : 0;
  const kb = Math.round(reqs.length ? (await Promise.all([])).length : 0);
  console.log(`${h.padEnd(32)} ${String(total).padStart(7)}  ${String(Math.round(doc)).padStart(7)}  ${String(reqs.length).padStart(3)}`);
}

// ---- Beranda: apakah ada indikator loading saat navigasi? ----
console.log("\n=== Cek indikator loading saat pindah halaman ===");
await page.goto(BASE + "/", { waitUntil: "networkidle" });
// klik link ke /buku secara SPA (bukan goto) lalu potret layar cepat
const link = page.locator('a[href="/buku"]').first();
if (await link.count()) {
  await link.click();
  await page.waitForTimeout(120); // potret saat navigasi sedang berjalan
  const adaIndikator = await page.evaluate(() => {
    const teks = document.body.innerText.toLowerCase();
    const skeleton = document.querySelector('[class*="skeleton"],[class*="loading"],[aria-busy="true"],progress');
    return {
      skeleton: !!skeleton,
      teksMemuat: /memuat|loading|sebentar/.test(teks),
    };
  });
  console.log("  saat navigasi 120ms:", JSON.stringify(adaIndikator));
  if (!adaIndikator.skeleton && !adaIndikator.teksMemuat) {
    console.log("  → TIDAK ADA feedback visual. Dengan force-dynamic, layar terasa diam.");
  }
}

// ---- Cek ukuran transfer dokumen HTML ----
console.log("\n=== Berat dokumen HTML per halaman ===");
for (const h of ["/", "/buku", "/dashboard"]) {
  const res = await page.goto(BASE + h, { waitUntil: "domcontentloaded" });
  const body = await res.body().catch(() => Buffer.alloc(0));
  console.log(`  ${h.padEnd(12)} ${(body.length / 1024).toFixed(1)} KB`);
}

await browser.close();
