// Ukur keseragaman tinggi chip filter kategori di HP + cek tidak ada teks 2 baris.
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
await page.waitForSelector(".tabs button", { timeout: 25000 });
await page.waitForTimeout(800);

const r = await page.evaluate(() => {
  // Hitung baris teks SESUNGGUHNYA lewat Range (bukan tebak dari tinggi/line-height).
  function barisTeks(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
    const tops = new Set(rects.map((x) => Math.round(x.top)));
    return tops.size;
  }
  const chips = [...document.querySelectorAll(".tabs button")].map((b) => {
    const rect = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return {
      teks: b.textContent.trim(),
      h: Math.round(rect.height),
      w: Math.round(rect.width),
      radius: cs.borderTopLeftRadius,
      baris: barisTeks(b),
      nowrap: cs.whiteSpace,
    };
  });
  const tinggi = [...new Set(chips.map((c) => c.h))];
  return {
    jumlah: chips.length,
    tinggiUnik: tinggi,
    seragam: tinggi.length === 1,
    semuaPil: chips.every((c) => c.radius !== "0px"),
    semuaNowrap: chips.every((c) => c.nowrap === "nowrap"),
    adaDuaBaris: chips.filter((c) => c.baris > 1).map((c) => c.teks),
    chips,
  };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
