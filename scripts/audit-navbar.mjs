// Audit presisi: di scroll MENTOK BAWAH, adakah elemen (termasuk tombol)
// yang benar-benar tertutup navbar? Ukur rect tiap elemen vs rect navbar.
import { chromium, devices } from "playwright";

const BASE = "http://127.0.0.1:3100";
const browser = await chromium.launch({ channel: "chrome" });

async function login(page, password) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#phone", { timeout: 20000 });
  await page.fill("#phone", "081220210193");
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  const modal = page.locator('[data-testid="force-password-modal"]');
  if (await modal.count()) {
    await page.fill("#np1", "RahasiaBaru99");
    await page.fill("#np2", "RahasiaBaru99");
    await modal.locator("button[type=submit]").click();
    await page.waitForSelector('[data-testid="force-password-modal"]', { state: "detached", timeout: 20000 });
  }
}

const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "id-ID" });
const page = await ctx.newPage();
await login(page, "RahasiaBaru99");
await page.goto(BASE + "/buku", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="book-card"]', { timeout: 25000 });
await page.waitForTimeout(1500);

// mentok bawah
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await page.waitForTimeout(1500);

const audit = await page.evaluate(() => {
  const nav = document.querySelector(".bottomnav");
  const navR = nav.getBoundingClientRect();
  const tertutup = [];
  const selektor = "button, a, [data-testid='book-card'], .cover, img";
  for (const el of document.querySelectorAll(selektor)) {
    if (el.closest(".bottomnav")) continue; // navbar bukan korban dirinya sendiri
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.bottom <= 0 || r.top >= window.innerHeight) continue;
    // irisan vertikal dengan navbar
    const irisan = Math.min(r.bottom, navR.bottom) - Math.max(r.top, navR.top);
    if (irisan > 1) {
      tertutup.push({
        tag: el.tagName.toLowerCase(),
        teks: (el.textContent || "").trim().slice(0, 28),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        irisanPx: Math.round(irisan),
      });
    }
  }
  return {
    navTop: Math.round(navR.top),
    navBottom: Math.round(navR.bottom),
    scrollY: Math.round(window.scrollY),
    scrollMax: Math.round(document.documentElement.scrollHeight - window.innerHeight),
    mentok: Math.abs(window.scrollY - (document.documentElement.scrollHeight - window.innerHeight)) < 2,
    jumlahTertutup: tertutup.length,
    tertutup: tertutup.slice(0, 10),
  };
});

console.log(JSON.stringify(audit, null, 2));
await browser.close();
