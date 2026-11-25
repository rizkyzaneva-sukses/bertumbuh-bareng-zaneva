/**
 * Cek tampilan LIVE dengan akun Bos: tab Arsip muncul & proporsinya wajar.
 * Password dari ENV, tidak ditulis ke file.
 */
import { chromium, devices } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "https://books.maulanacorp.biz.id";
const PASS = process.env.LIVE_PASS;
const PHONE = process.env.LIVE_PHONE ?? "081220210193";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "screens") + path.sep;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "id-ID", timezoneId: "Asia/Jakarta" });
const page = await ctx.newPage();

await page.goto(BASE + "/login");
await page.waitForSelector("#phone", { timeout: 30000 });
await page.fill("#phone", PHONE);
await page.fill("#password", PASS);
await page.click('button[type="submit"]');
await page.waitForTimeout(3500);
console.log("setelah login:", page.url());

await page.goto(BASE + "/admin/buku");
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + "live-arsip-rak.png", fullPage: false });
const tabRak = page.locator('[data-testid="tab-rak"]');
const tabArsip = page.locator('[data-testid="tab-arsip"]');
console.log("tab rak ada:", await tabRak.count(), "| tab arsip ada:", await tabArsip.count());
if (await tabArsip.count()) {
  console.log("label rak  :", (await tabRak.innerText()).replace(/\n/g, " "));
  console.log("label arsip:", (await tabArsip.innerText()).replace(/\n/g, " "));
  await tabArsip.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT + "live-arsip-tab.png" });
}

// ukur proporsi font supaya tidak "kegedean" ala UI amatir
const ukur = await page.evaluate(() => {
  const h1 = document.querySelector("h1");
  const btn = document.querySelector('[data-testid="unarchive-book"], [data-testid="archive-book"]');
  const cs = (el) => (el ? getComputedStyle(el) : null);
  return {
    h1: cs(h1)?.fontSize,
    btn: cs(btn)?.fontSize,
    btnPad: btn ? `${cs(btn).paddingTop} ${cs(btn).paddingRight}` : null,
    viewport: `${innerWidth}x${innerHeight}`,
    overflowX: document.documentElement.scrollWidth > innerWidth,
  };
});
console.log("proprosi:", JSON.stringify(ukur));

await browser.close();
