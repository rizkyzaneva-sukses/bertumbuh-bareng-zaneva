// Uji LIVE produksi lewat domain publik: login admin, buka /buku, hitung sampul.
// Ini yang membuktikan fitur bekerja untuk user nyata, bukan cuma build hijau.
import { chromium, devices } from "playwright";

const BASE = "https://books.maulanacorp.biz.id";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "id-ID", timezoneId: "Asia/Jakarta" });
const page = await ctx.newPage();

await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForSelector("#phone", { timeout: 30000 });
await page.fill("#phone", process.env.BBZ_PHONE);
await page.fill("#password", process.env.BBZ_PW);
await page.click("button[type=submit]");
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 40000 });

await page.goto(BASE + "/buku", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForSelector('[data-testid="book-card"]', { timeout: 40000 });
await page.waitForTimeout(4000);

const stats = await page.evaluate(() => ({
  kartu: document.querySelectorAll('[data-testid="book-card"]').length,
  gambarAsli: document.querySelectorAll('[data-cover="image"]').length,
  generatif: document.querySelectorAll('[data-cover="generated"]').length,
  pola: [...new Set([...document.querySelectorAll("[data-pattern]")].map((e) => e.getAttribute("data-pattern")))].sort(),
  sectionKategori: document.querySelectorAll('[data-testid="shelf-section"]').length,
  hint: document.querySelector('[data-testid="shelf-hint"]')?.textContent?.trim(),
}));
console.log("LIVE rak:", JSON.stringify(stats));

await page.screenshot({ path: "screens/live-rak-hp.png" });

// cek gambarnya benar-benar termuat (bukan kotak rusak)
const broken = await page.evaluate(() =>
  Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc.slice(-40)),
);
console.log("gambar rusak:", broken.length === 0 ? "tidak ada" : broken);

await browser.close();
const ok = stats.gambarAsli >= 5 && stats.generatif > 20 && broken.length === 0;
console.log(ok ? "\nLULUS — rak live menampilkan sampul" : "\nPERIKSA — angka tidak seperti diharapkan");
process.exit(ok ? 0 : 1);
