// Ukur chip + navbar LANGSUNG DI PRODUKSI (bukan lokal).
// Pakai akun uji yang sudah ada di server: 628999000111.
import { chromium, devices } from "playwright";

const BASE = "https://books.maulanacorp.biz.id";
const PHONE = "628999000111";
const PW = "UjiPanduan2026";

const browser = await chromium.launch({ channel: "chrome" });

async function login(page) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#phone", { timeout: 30000 });
  // Tunggu React benar-benar hydrate: tanpa ini klik jatuh ke submit native dan
  // form terkirim GET, sehingga password bocor ke query string URL.
  await page.waitForFunction(
    () => {
      const f = document.querySelector("form");
      return !!f && Object.keys(f).some((k) => k.startsWith("__reactProps$"));
    },
    null,
    { timeout: 30000 },
  );
  await page.fill("#phone", PHONE);
  await page.fill("#password", PW);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 40000 });
  const modal = page.locator('[data-testid="force-password-modal"]');
  if (await modal.count()) {
    throw new Error("akun uji minta ganti password - tidak saya ubah");
  }
}

const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "id-ID" });
const page = await ctx.newPage();
await login(page);
console.log("login produksi: OK ->", new URL(page.url()).pathname);

await page.goto(BASE + "/buku", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('[data-testid="book-card"]', { timeout: 40000 });
await page.waitForTimeout(2000);

const chip = await page.evaluate(() => {
  function barisTeks(el) {
    const r = document.createRange();
    r.selectNodeContents(el);
    const rects = [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
    return new Set(rects.map((x) => Math.round(x.top))).size;
  }
  const chips = [...document.querySelectorAll(".tabs button")].map((b) => {
    const rect = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return {
      teks: b.textContent.trim(),
      h: Math.round(rect.height),
      radius: cs.borderTopLeftRadius,
      nowrap: cs.whiteSpace,
      baris: barisTeks(b),
    };
  });
  const tinggi = [...new Set(chips.map((c) => c.h))];
  return {
    jumlahChip: chips.length,
    tinggiUnik: tinggi,
    seragam: tinggi.length === 1,
    semuaPil: chips.every((c) => c.radius === "999px"),
    semuaNowrap: chips.every((c) => c.nowrap === "nowrap"),
    adaDuaBaris: chips.filter((c) => c.baris > 1).map((c) => c.teks),
    adaMaskGradien: getComputedStyle(document.querySelector(".tabs")).maskImage !== "none",
    jumlahKartu: document.querySelectorAll('[data-testid="book-card"]').length,
    sampulAsli: document.querySelectorAll('[data-cover="image"]').length,
    sampulGeneratif: document.querySelectorAll('[data-cover="generated"]').length,
  };
});

await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await page.waitForTimeout(1500);
const nav = await page.evaluate(() => {
  const navEl = document.querySelector(".bottomnav");
  const navR = navEl.getBoundingClientRect();
  const cards = [...document.querySelectorAll('[data-testid="book-card"]')];
  const last = cards[cards.length - 1].getBoundingClientRect();
  const tombol = [...cards[cards.length - 1].querySelectorAll("button, a")].map((b) => Math.round(b.getBoundingClientRect().bottom));
  return {
    navTop: Math.round(navR.top),
    kartuTerakhirBottom: Math.round(last.bottom),
    kartuTerakhirUtuh: last.bottom <= navR.top,
    semuaTombolUtuh: tombol.every((b) => b <= navR.top),
  };
});

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1000);
await page.screenshot({ path: "screens/produksi-hp-rak.png", fullPage: false });

const lulus =
  chip.seragam && chip.semuaPil && chip.semuaNowrap &&
  chip.adaDuaBaris.length === 0 && chip.adaMaskGradien &&
  nav.kartuTerakhirUtuh && nav.semuaTombolUtuh;

console.log(JSON.stringify({ chip, nav, KESIMPULAN: lulus ? "LULUS DI PRODUKSI" : "GAGAL DI PRODUKSI" }, null, 2));
await browser.close();
process.exit(lulus ? 0 : 1);
