/** Tangkapan layar form Edit pengguna di LIVE (akun Bos). */
import { chromium, devices } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "https://books.maulanacorp.biz.id";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "screens") + path.sep;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "id-ID", timezoneId: "Asia/Jakarta" });
const page = await ctx.newPage();

await page.goto(BASE + "/login");
await page.waitForSelector("#phone", { timeout: 30000 });
await page.fill("#phone", process.env.LIVE_PHONE ?? "081220210193");
await page.fill("#password", process.env.LIVE_PASS);
await page.click('button[type="submit"]');
await page.waitForTimeout(3500);

await page.goto(BASE + "/admin/pengguna");
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + "live-user-1-daftar.png" });

// buka form Edit pada baris pertama yang bisa diedit
const tombol = page.locator('[data-testid="edit-user"]').first();
if (await tombol.count()) {
  await tombol.click();
  await page.waitForSelector('[data-testid="edit-user-form"]', { timeout: 10000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + "live-user-2-form.png" });
}

// ukur proporsi
const ukur = await page.evaluate(() => {
  const inp = document.querySelector('[data-testid="edit-user-name"]');
  const btn = document.querySelector('[data-testid="edit-user-save"]');
  const cs = (el) => (el ? getComputedStyle(el) : null);
  return {
    inputFont: cs(inp)?.fontSize,
    inputH: inp ? Math.round(inp.getBoundingClientRect().height) : null,
    btnFont: cs(btn)?.fontSize,
    btnH: btn ? Math.round(btn.getBoundingClientRect().height) : null,
    overflowX: document.documentElement.scrollWidth > innerWidth,
    viewport: `${innerWidth}x${innerHeight}`,
  };
});
console.log("proporsi:", JSON.stringify(ukur));

await browser.close();
