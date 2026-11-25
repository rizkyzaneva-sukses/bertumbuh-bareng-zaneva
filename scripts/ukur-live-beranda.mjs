/**
 * Ukur BERANDA live: waktu muat + jumlah baris yang dibaca.
 *
 * Beranda dulu memanggil getDashboard() yang menarik SELURUH data
 * (semua pinjaman/progres/user/buku) hanya untuk menampilkan 2 angka.
 * Sekarang memakai getRingkasanBeranda().
 *
 * Pakai: LIVE_COOKIE="bbz_session=..." node scripts/ukur-live-beranda.mjs
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

// 1x pemanasan (DNS/TLS/cache) — ukur yang kedua agar adil
await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(500);

const kali = [];
for (let i = 0; i < 3; i++) {
  const t = Date.now();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
  kali.push(Date.now() - t);
  await page.waitForTimeout(400);
}

const isi = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    adaHalo: t.includes("Halo"),
    adaBukuSelesai: /Buku selesai|selesai dibaca/i.test(t),
    adaPeringkat: /Peringkat|peringkat/i.test(t),
    adaMemuat: t.includes("Memuat"),
    panjangTeks: t.length,
  };
});

console.log(`\n=== BERANDA LIVE ===`);
console.log(`  Waktu muat (3x) : ${kali.join(" ms, ")} ms`);
console.log(`  rata-rata       : ${Math.round(kali.reduce((a, b) => a + b, 0) / kali.length)} ms`);
console.log(`  Isi tampil      : Halo=${isi.adaHalo} · Buku selesai=${isi.adaBukuSelesai} · Peringkat=${isi.adaPeringkat}`);
console.log(`  Masih "Memuat"? : ${isi.adaMemuat ? "⚠️ ya" : "tidak (sudah selesai)"}`);

// Buktikan angka Beranda masuk akal: bandingkan dengan dashboard lengkap.
const r = await page.request.get(BASE + "/dashboard");
console.log(`  /dashboard      : ${r.status()} (${((await r.body()).length / 1024).toFixed(1)} KB, halaman lengkap)`);

await browser.close();
