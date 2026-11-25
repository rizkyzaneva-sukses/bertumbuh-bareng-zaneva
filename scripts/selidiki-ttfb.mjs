/**
 * Selidiki kenapa TTFB naik setelah Cloudflare proxy aktif.
 *
 * Hipotesis yang diuji:
 *   A. Aset statis (_next/static) TIDAK di-cache Cloudflare → browser tetap
 *      mengunduh dari origin untuk setiap kunjungan.
 *   B. TTFB tinggi hanya pada koneksi baru; koneksi hangat lebih cepat.
 *   C. Cloudflare menambah latensi ke origin (hop CF → server).
 */
import { chromium, devices } from "playwright";

const BASE = "https://books.maulanacorp.biz.id";
const ORIGIN = "169.58.38.97";
const COOKIE = process.env.LIVE_COOKIE;
if (!COOKIE) {
  console.error("LIVE_COOKIE belum diisi");
  process.exit(1);
}
const [nama, nilai] = COOKIE.split("=");

// ---------- C: TTFB langsung ke origin (bypass Cloudflare) ----------
async function ttfbOrigin(path, kali = 5) {
  const hasil = [];
  for (let i = 0; i < kali; i++) {
    const t = Date.now();
    try {
      // --resolve memaksa IP origin tapi tetap pakai HTTPS + SNI domain
      const r = await fetch(BASE + path, {
        headers: { cookie: COOKIE },
        signal: AbortSignal.timeout(30000),
      });
      await r.text();
      hasil.push(Date.now() - t);
    } catch {
      hasil.push(-1);
    }
  }
  return hasil;
}

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
await ctx.addCookies([
  { name: nama, value: nilai, domain: "books.maulanacorp.biz.id", path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
]);
const page = await ctx.newPage();

// ---------- A: apakah aset statis di-cache Cloudflare? ----------
const statis = [];
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("/_next/static/")) {
    statis.push({
      status: r.status(),
      cache: r.headers()["cf-cache-status"] ?? "-",
      enc: r.headers()["content-encoding"] ?? "-",
      umur: r.headers()["age"] ?? "-",
    });
  }
});

console.log("Memuat /buku sekali untuk melihat status cache aset statis…\n");
await page.goto(BASE + "/buku", { waitUntil: "networkidle", timeout: 120000 });

const ringkas = {};
for (const s of statis) {
  const k = `${s.cache} (enc=${s.enc})`;
  ringkas[k] = (ringkas[k] ?? 0) + 1;
}
console.log(`=== ASET STATIS (${statis.length} file) ===`);
for (const [k, v] of Object.entries(ringkas)) console.log(`  ${String(v).padStart(3)}×  cf-cache-status: ${k}`);
const hit = statis.filter((s) => s.cache === "HIT").length;
console.log(`  → HIT: ${hit}/${statis.length} ${hit === statis.length ? "✅ semua ter-cache" : "⚠️ ada yang belum ter-cache"}`);

// ---------- B: TTFB berulang lewat Cloudflare ----------
const ttfbs = [];
for (let i = 0; i < 5; i++) {
  const t = Date.now();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 120000 });
  ttfbs.push(Date.now() - t);
  await page.waitForTimeout(300);
}
console.log(`\n=== TTFB BERANDA lewat Cloudflare (5x) ===`);
console.log(`  ${ttfbs.join(" ms, ")} ms`);
console.log(`  rata-rata ${Math.round(ttfbs.reduce((a, b) => a + b, 0) / ttfbs.length)} ms`);
console.log(`  pertama ${ttfbs[0]} ms · hangat ${ttfbs[ttfbs.length - 1]} ms`);

// ---------- C: bandingkan origin langsung ----------
const langsung = await ttfbOrigin("/");
console.log(`\n=== BERANDA lewat INTERNET biasa (bukan pengukuran origin) ===`);
console.log(`  ${langsung.join(" ms, ")} ms`);

// ---------- cek header cache HTML ----------
const r = await page.request.get(BASE + "/buku");
console.log(`\n=== HEADER /buku ===`);
for (const k of ["cf-cache-status", "cache-control", "content-encoding", "cf-ray", "age"]) {
  console.log(`  ${k.padEnd(16)} ${r.headers()[k] ?? "(tidak ada)"}`);
}

await browser.close();
