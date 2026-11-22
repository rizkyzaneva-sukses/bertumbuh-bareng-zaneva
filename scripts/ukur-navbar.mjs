// Ukur APAKAH bottom nav menutupi kartu sampul di layar HP.
// Bukan menebak dari gambar: hitung irisan geometri nyata + cek apakah bisa digulir.
import { chromium, devices } from "playwright";
import fs from "node:fs";

const BASE = "http://127.0.0.1:3100";
fs.mkdirSync("screens", { recursive: true });

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

let pw = null;
for (const cand of ["RahasiaBaru99", "Zaneva2026"]) {
  const probe = await browser.newContext({ ...devices["iPhone 13"] });
  const pg = await probe.newPage();
  try {
    await login(pg, cand);
    pw = cand;
    await probe.close();
    break;
  } catch (e) {
    console.log("coba", cand, "->", String(e.message).slice(0, 90));
    await probe.close();
  }
}
if (!pw) throw new Error("tidak bisa login");

const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "id-ID" });
const page = await ctx.newPage();
await login(page, pw);
await page.goto(BASE + "/buku", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="book-card"]', { timeout: 25000 });
await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete), null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1000);

async function ukur(label) {
  return await page.evaluate(() => {
    const nav = document.querySelector(".bottomnav");
    const navBox = nav ? nav.getBoundingClientRect() : null;
    const cards = [...document.querySelectorAll('[data-testid="book-card"]')];
    const boxes = cards.map((c) => {
      const r = c.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
    });
    // kartu yang IRIS dengan area navbar (masih di viewport)
    const navTop = navBox ? navBox.top : Infinity;
    const irisan = boxes.filter((b) => b.bottom > navTop && b.top < window.innerHeight);
    const wrap = document.querySelector(".wrap");
    const cs = wrap ? getComputedStyle(wrap) : null;
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      navTop: navBox ? Math.round(navBox.top) : null,
      navH: navBox ? Math.round(navBox.height) : null,
      navVisible: navBox ? getComputedStyle(nav).display !== "none" : false,
      wrapPadBottom: cs ? cs.paddingBottom : null,
      jumlahKartu: cards.length,
      kartuIrisNavbar: irisan.length,
      // apakah kartu terakhir bisa mencapai area bebas navbar saat digulir mentok?
      bisaDigulir: document.documentElement.scrollHeight > window.innerHeight,
    };
  });
}

const awal = await ukur("awal");
console.log("UKUR-1 (atas):", JSON.stringify(awal, null, 0));

// gulir mentok ke bawah: apakah kartu terakhir masih ketutup navbar?
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await page.waitForTimeout(1200);
const akhir = await page.evaluate(() => {
  const nav = document.querySelector(".bottomnav");
  const navTop = nav ? nav.getBoundingClientRect().top : Infinity;
  const cards = [...document.querySelectorAll('[data-testid="book-card"]')];
  const last = cards[cards.length - 1].getBoundingClientRect();
  const first = cards[0].getBoundingClientRect();
  return {
    navTop: Math.round(navTop),
    kartuTerakhirBottom: Math.round(last.bottom),
    jarakKartuTerakhirKeNav: Math.round(navTop - last.bottom),
    kartuPertamaTop: Math.round(first.top),
    kartuPertamaUtuh: first.top >= 0,
  };
});
console.log("UKUR-2 (mentok bawah):", JSON.stringify(akhir, null, 0));

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(800);
await page.screenshot({ path: "screens/hp-ukur-atas.png", fullPage: false });
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await page.waitForTimeout(900);
await page.screenshot({ path: "screens/hp-ukur-bawah.png", fullPage: false });

console.log("pw:", pw);
await browser.close();
