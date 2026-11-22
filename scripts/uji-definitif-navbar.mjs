// UJI DEFINITIF (logika diperbaiki): bisakah SETIAP kartu terlihat utuh di atas navbar?
//
// Prinsip:
// 1. Kartu di TENGAH pasti bisa dilihat utuh asalkan tingginya <= area bebas navbar.
// 2. Kartu TERAKHIR paling berisiko: scroll berhenti, jadi bottom-nya saat MENTOK
//    harus <= navTop. Kalau lebih, ia tak akan pernah utuh.
//
// Catatan koordinat: menggulir ke bawah (delta > 0) menggeser elemen NAIK,
// jadi bottom saat mentok = r.bottom - (maxScroll - scrollY).  (BUKAN +)
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
await page.waitForTimeout(1200);

// --- Fase 1: ukur tinggi kartu vs area bebas navbar ---
const fase1 = await page.evaluate(() => {
  const nav = document.querySelector(".bottomnav");
  const navTop = nav.getBoundingClientRect().top;
  const cards = [...document.querySelectorAll('[data-testid="book-card"]')];
  const tinggi = cards.map((c) => Math.round(c.getBoundingClientRect().height));
  const maxTinggi = Math.max(...tinggi);
  return {
    navTop: Math.round(navTop),
    jumlahKartu: cards.length,
    tinggiKartuMaks: maxTinggi,
    tinggiKartuMin: Math.min(...tinggi),
    semuaKartuMuatDiAreaBebas: maxTinggi <= navTop,
    sisaRuangPx: Math.round(navTop - maxTinggi),
  };
});

// --- Fase 2: gulir mentok bawah, ukur kartu terakhir ---
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await page.waitForTimeout(1500);
const fase2 = await page.evaluate(() => {
  const nav = document.querySelector(".bottomnav");
  const navR = nav.getBoundingClientRect();
  const cards = [...document.querySelectorAll('[data-testid="book-card"]')];
  const last = cards[cards.length - 1].getBoundingClientRect();
  const tombolLast = [...cards[cards.length - 1].querySelectorAll("button, a")].map((b) => {
    const r = b.getBoundingClientRect();
    return { teks: (b.textContent || "").trim().slice(0, 14), bottom: Math.round(r.bottom) };
  });
  return {
    mentok: Math.abs(window.scrollY - (document.documentElement.scrollHeight - window.innerHeight)) < 2,
    navTop: Math.round(navR.top),
    kartuTerakhirBottom: Math.round(last.bottom),
    sisaRuangKartuTerakhirPx: Math.round(navR.top - last.bottom),
    kartuTerakhirUtuh: last.bottom <= navR.top,
    tombolKartuTerakhir: tombolLast,
    semuaTombolUtuh: tombolLast.every((t) => t.bottom <= navR.top),
  };
});

const lulus = fase1.semuaKartuMuatDiAreaBebas && fase2.kartuTerakhirUtuh && fase2.semuaTombolUtuh;
console.log(JSON.stringify({ fase1, fase2, KESIMPULAN: lulus ? "LULUS: tidak ada yang tertutup navbar" : "GAGAL: ada elemen tertutup navbar" }, null, 2));
await browser.close();
process.exit(lulus ? 0 : 1);
