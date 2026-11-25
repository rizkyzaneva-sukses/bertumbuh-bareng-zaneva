/**
 * Verifikasi proporsi visual HANYA pada elemen yang benar-benar terlihat.
 * Pemeriksaan sebelumnya menghitung elemen tersembunyi (tinggi 0), sehingga
 * angka "tombol terpendek 0px" menyesatkan.
 *
 * Pakai: LIVE_COOKIE="bbz_session=..." node scripts/cek-proporsi-live.mjs
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
  { path: "/riwayat", nama: "Riwayat" },
  { path: "/profil", nama: "Profil" },
];

for (const h of halaman) {
  await page.goto(BASE + h.path, { waitUntil: "networkidle", timeout: 120000 });

  const v = await page.evaluate(() => {
    // Hanya elemen yang punya kotak nyata di layar.
    const terlihat = (e) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
    };

    const tombol = [...document.querySelectorAll("button, a.btn, .btn")]
      .filter(terlihat)
      .map((b) => Math.round(b.getBoundingClientRect().height))
      .filter((h) => h > 0);

    const input = [...document.querySelectorAll("input, textarea, select")]
      .filter(terlihat)
      .map((i) => parseFloat(getComputedStyle(i).fontSize));

    // Teks kecil: abaikan label dekoratif sampul buku (cover-cat/author/spine).
    const teksKecil = [...document.querySelectorAll("p, span, small, li")]
      .filter(terlihat)
      .filter((e) => !e.closest(".cover"))
      .filter((e) => e.textContent.trim().length > 8)
      .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).length;

    return {
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      layar: window.innerWidth,
      tombol: tombol.length ? Math.min(...tombol) : null,
      jumlahTombol: tombol.length,
      inputTerkecil: input.length ? Math.min(...input) : null,
      jumlahInput: input.length,
      teksKecil,
    };
  });

  console.log(`\n${h.nama} (${h.path})`);
  console.log(`  layar ${v.layar}px · scrollWidth ${v.scrollWidth}px → overflow ${v.overflow ? "❌ ADA" : "✅ tidak"}`);
  console.log(`  tombol terlihat: ${v.jumlahTombol} · terpendek ${v.tombol ?? "-"}px ${v.tombol && v.tombol >= 44 ? "✅" : v.tombol ? "⚠️ <44" : ""}`);
  if (v.jumlahInput) {
    console.log(`  input: ${v.jumlahInput} · font terkecil ${v.inputTerkecil}px ${v.inputTerkecil >= 16 ? "✅" : "⚠️ <16 (iOS auto-zoom)"}`);
  }
  console.log(`  teks < 12px (di luar sampul): ${v.teksKecil}`);
}

await browser.close();
