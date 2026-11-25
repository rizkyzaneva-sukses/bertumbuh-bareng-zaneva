/**
 * Ukur performa SETELAH Cloudflare proxy aktif, memakai Chrome (bukan curl).
 *
 * Penting: curl di Windows ini dibangun tanpa nghttp2 sehingga SELALU melapor
 * HTTP/1.1 walau server mendukung HTTP/2. Chrome melaporkan protokol asli.
 *
 * Juga memeriksa hal yang bisa RUSAK karena proxy:
 *   - sampul masih tampil (Cloudflare bisa meng-cache respons 401)
 *   - header keamanan tidak hilang
 *
 * Pakai: LIVE_COOKIE="bbz_session=..." node scripts/ukur-cloudflare.mjs
 */
import { chromium, devices } from "playwright";

const BASE = "https://books.maulanacorp.biz.id";
const COOKIE = process.env.LIVE_COOKIE;
if (!COOKIE) {
  console.error("LIVE_COOKIE belum diisi");
  process.exit(1);
}
const [nama, nilai] = COOKIE.split("=");

const url = new URL(BASE);
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
await ctx.addCookies([
  { name: nama, value: nilai, domain: url.hostname, path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
]);
const page = await ctx.newPage();

// ---- protokol & CDN ----
const resp = await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 90000 });
const h = resp.headers();
console.log(`\n=== EDGE / CLOUDFLARE ===`);
console.log(`  Server          : ${h["server"] ?? "-"}`);
console.log(`  CF-RAY          : ${h["cf-ray"] ?? "❌ tidak ada (belum lewat Cloudflare)"}`);
console.log(`  cf-cache-status : ${h["cf-cache-status"] ?? "-"}`);
console.log(`  alt-svc         : ${h["alt-svc"] ?? "-"}`);

const proto = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  return {
    protocol: nav?.nextHopProtocol ?? "?",
    ttfb: nav ? Math.round(nav.responseStart) : null,
    tls: nav ? Math.round(nav.secureConnectionStart > 0 ? nav.connectEnd - nav.secureConnectionStart : 0) : null,
  };
});
console.log(`  Protokol (Chrome): ${proto.protocol} ${proto.protocol.startsWith("h2") || proto.protocol.startsWith("h3") ? "✅" : "⚠️"}`);
console.log(`  TTFB            : ${proto.ttfb} ms`);
console.log(`  TLS handshake   : ${proto.tls} ms`);

// ---- header keamanan masih ada? ----
const perlu = ["strict-transport-security", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"];
let ada = 0;
const hilang = [];
for (const k of perlu) {
  if (h[k]) ada++;
  else hilang.push(k);
}
console.log(`  Header keamanan : ${ada}/5 ${hilang.length ? "hilang: " + hilang.join(", ") : "✅"}`);

// ---- /buku: waktu muat + sampul (proxy bisa merusak cache 401) ----
await page.goto(BASE + "/buku", { waitUntil: "networkidle", timeout: 120000 });
const kali = [];
for (let i = 0; i < 3; i++) {
  const t = Date.now();
  await page.goto(BASE + "/buku", { waitUntil: "networkidle", timeout: 120000 });
  kali.push(Date.now() - t);
  await page.waitForTimeout(400);
}
await page.evaluate(() => window.scrollBy(0, 600));
await page.waitForTimeout(1200);

const info = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img[alt^="Sampul"]')];
  return {
    jumlah: imgs.length,
    tampil: imgs.filter((i) => i.naturalWidth > 0).length,
    rusak: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    resolusi: imgs[0]?.naturalWidth ?? 0,
  };
});

const rata = Math.round(kali.reduce((a, b) => a + b, 0) / kali.length);
console.log(`\n=== /buku SESUDAH CLOUDFLARE ===`);
console.log(`  Muat (3x)       : ${kali.join(" ms, ")} ms`);
console.log(`  Rata-rata       : ${rata} ms`);
console.log(`  Sampul          : ${info.jumlah} elemen · TAMPIL ${info.tampil} · RUSAK ${info.rusak} ${info.rusak === 0 ? "✅" : "❌"}`);
console.log(`  Resolusi        : ${info.resolusi}px`);

// ---- cek apakah Cloudflare meng-cache respons 401 sampul ----
const ujiCover = await page.request.get(BASE + "/api/books/tidak-ada/cover?w=320");
console.log(`\n  Rute sampul (id palsu): ${ujiCover.status()} · cf-cache-status: ${ujiCover.headers()["cf-cache-status"] ?? "-"}`);

const sehat = info.rusak === 0 && info.tampil > 0 && ada === 5 && !!h["cf-ray"];
console.log(`\n${"═".repeat(58)}`);
console.log(sehat ? "✅ SEHAT lewat Cloudflare — sampul tampil, header lengkap" : "❌ ADA MASALAH");
console.log("═".repeat(58));

await browser.close();
process.exitCode = sehat ? 0 : 1;
