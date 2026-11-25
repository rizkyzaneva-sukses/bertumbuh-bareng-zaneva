/**
 * Ukur yang DILIHAT PENGGUNA, bukan networkidle.
 *
 * Temuan: `load` event /buku selesai ~417 ms, tapi pengukuran networkidle
 * menunggu 2,2 detik karena gambar lazy-load di bawah layar terus dimuat.
 * Menunggu networkidle itu BUKAN yang dialami manusia — pengguna melihat layar
 * sudah terisi jauh sebelum itu.
 *
 * Metrik yang dipakai:
 *   FCP  — pixel pertama muncul
 *   LCP  — elemen terbesar (biasanya sampul) selesai tampil
 *   waktu sampai sampul PERTAMA di layar tampil
 *
 * Pakai: LIVE_COOKIE="bbz_session=..." node scripts/ukur-persepsi.mjs
 */
import { chromium, devices } from "playwright";

const BASE = "https://books.maulanacorp.biz.id";
const COOKIE = process.env.LIVE_COOKIE;
if (!COOKIE) {
  console.error("LIVE_COOKIE belum diisi");
  process.exit(1);
}
const [nama, nilai] = COOKIE.split("=");

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
await ctx.addCookies([
  { name: nama, value: nilai, domain: "books.maulanacorp.biz.id", path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
]);
const page = await ctx.newPage();

const halaman = [
  { path: "/buku", nama: "Rak buku" },
  { path: "/", nama: "Beranda" },
];

for (const h of halaman) {
  // pemanasan supaya DNS/TLS/cache seperti pemakaian kedua
  await page.goto(BASE + h.path, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(600);

  const t = Date.now();
  await page.goto(BASE + h.path, { waitUntil: "load", timeout: 120000 });
  const sampaiLoad = Date.now() - t;

  const m = await page.evaluate(() => {
    const paint = performance.getEntriesByType("paint");
    const fcp = paint.find((p) => p.name === "first-contentful-paint");
    const lcp = performance.getEntriesByType("largest-contentful-paint").pop();
    const nav = performance.getEntriesByType("navigation")[0];

    // Sampul pertama yang ada di viewport dan sudah termuat.
    const imgs = [...document.querySelectorAll('img[alt^="Sampul"]')];
    const diLayar = imgs.filter((i) => {
      const r = i.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    });
    const sudahTampil = diLayar.filter((i) => i.naturalWidth > 0);

    return {
      fcp: fcp ? Math.round(fcp.startTime) : null,
      lcp: lcp ? Math.round(lcp.startTime) : null,
      ttfb: nav ? Math.round(nav.responseStart) : null,
      protocol: nav?.nextHopProtocol ?? "?",
      sampulDiLayar: diLayar.length,
      sampulTampilDiLayar: sudahTampil.length,
    };
  });

  console.log(`\n=== ${h.nama} (${h.path}) ===`);
  console.log(`  Protokol         : ${m.protocol}`);
  console.log(`  TTFB             : ${m.ttfb} ms`);
  console.log(`  FCP (pixel 1st)  : ${m.fcp} ms`);
  console.log(`  LCP (elemen besar): ${m.lcp} ms`);
  console.log(`  Load event       : ${sampaiLoad} ms`);
  console.log(`  Sampul di layar  : ${m.sampulDiLayar} · sudah tampil ${m.sampulTampilDiLayar}`);
  const lambat = m.lcp && m.lcp > 2500;
  console.log(`  Nilai LCP        : ${lambat ? "⚠️ >2500 ms (Google: perlu diperbaiki)" : "✅ baik (<2500 ms)"}`);
}

await browser.close();
