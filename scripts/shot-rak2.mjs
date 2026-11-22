// Tangkap layar rak versi baru (variasi warna per buku).
import { chromium, devices } from "playwright";
import fs from "node:fs";

const BASE = "http://127.0.0.1:3100";
const OUT = "screens";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });

/** Satu percobaan login deterministik: isi, submit, tunggu keluar dari /login. */
async function login(page, password) {
  // waitUntil domcontentloaded: stream TURBOPACK tidak pernah memicu event "load".
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#phone", { timeout: 20000 });
  await page.fill("#phone", "081220210193");
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  try {
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  } catch {
    const alert = await page.locator("[role=alert]").first().textContent().catch(() => "");
    throw new Error(`login gagal (${password}): ${alert}`);
  }
  const modal = page.locator('[data-testid="force-password-modal"]');
  if (await modal.count()) {
    await page.fill("#np1", "RahasiaBaru99");
    await page.fill("#np2", "RahasiaBaru99");
    await modal.locator("button[type=submit]").click();
    await page.waitForSelector('[data-testid="force-password-modal"]', { state: "detached", timeout: 20000 });
  }
}

async function openShelf(page) {
  await page.goto(BASE + "/buku", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="book-card"]', { timeout: 25000 });
  // tunggu gambar (cover asli) benar-benar termuat sebelum memotret
  await page.waitForFunction(
    () => Array.from(document.images).every((i) => i.complete),
    null,
    { timeout: 20000 },
  ).catch(() => {});
  await page.waitForTimeout(1200);
}

let pw = null;
for (const cand of ["RahasiaBaru99", "Zaneva2026"]) {
  const probe = await browser.newContext();
  const pg = await probe.newPage();
  try {
    await login(pg, cand);
    pw = cand;
    await probe.close();
    break;
  } catch (e) {
    console.log(String(e.message).slice(0, 120));
    await probe.close();
  }
}
if (!pw) throw new Error("tidak ada password admin yang berlaku");
console.log("password admin berlaku:", pw);

// ---- desktop: rak penuh ----
const ctx = await browser.newContext({ viewport: { width: 1200, height: 1500 }, locale: "id-ID", timezoneId: "Asia/Jakarta" });
const page = await ctx.newPage();
await login(page, pw);
await openShelf(page);
const stats = await page.evaluate(() => ({
  kartu: document.querySelectorAll('[data-testid="book-card"]').length,
  gambarAsli: document.querySelectorAll('[data-cover="image"]').length,
  generatif: document.querySelectorAll('[data-cover="generated"]').length,
  pola: [...new Set([...document.querySelectorAll("[data-pattern]")].map((e) => e.getAttribute("data-pattern")))].sort(),
}));
console.log("rak:", JSON.stringify(stats));
await page.screenshot({ path: OUT + "/baru-rak-desktop.png", fullPage: false });
await page.evaluate(() => window.scrollBy(0, 950));
await page.waitForTimeout(900);
await page.screenshot({ path: OUT + "/baru-rak-desktop-2.png", fullPage: false });

// ---- filter Produktivitas: uji variasi warna dalam satu kategori ----
await openShelf(page);
await page.locator(".tabs button", { hasText: "Produktivitas" }).first().click();
await page.waitForTimeout(1500);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + "/baru-rak-produktivitas.png", fullPage: false });

// ---- HP ----
const ctx2 = await browser.newContext({ ...devices["iPhone 13"], locale: "id-ID", timezoneId: "Asia/Jakarta" });
const m = await ctx2.newPage();
await login(m, pw);
await openShelf(m);
await m.screenshot({ path: OUT + "/baru-rak-hp.png", fullPage: false });

// ---- beranda (hero + kartu pinjaman) ----
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.screenshot({ path: OUT + "/baru-beranda.png", fullPage: false });

console.log("selesai");
await browser.close();
