/**
 * Verifikasi akhir SETELAH Cloudflare proxy: semua halaman utama merespons 200,
 * tidak ada layar error, dan tidak ada respons 401 yang ter-cache Cloudflare.
 *
 * Pakai: LIVE_COOKIE="bbz_session=..." node scripts/verifikasi-akhir.mjs
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

const halaman = ["/", "/buku", "/riwayat", "/profil", "/usulan", "/dashboard", "/admin/buku", "/admin/pinjaman", "/admin/pengguna", "/admin/usulan"];
let gagal = 0;

console.log(`\n=== VERIFIKASI HALAMAN (lewat Cloudflare) ===`);
for (const h of halaman) {
  const t = Date.now();
  const r = await page.goto(BASE + h, { waitUntil: "domcontentloaded", timeout: 120000 });
  const ms = Date.now() - t;
  const status = r?.status() ?? 0;
  const teks = (await page.textContent("body")) ?? "";
  const error = /Halaman gagal dimuat|Application error|Internal Server Error/i.test(teks);
  const ok = status === 200 && !error;
  if (!ok) gagal++;
  console.log(`  ${ok ? "✅" : "❌"} ${h.padEnd(20)} ${status} · ${String(ms).padStart(4)} ms${error ? " · LAYAR ERROR" : ""}`);
}

// ---- pastikan respons 401 tidak ter-cache Cloudflare ----
const tanpaLogin = await page.request.get(BASE + "/api/admin/users", { headers: {} });
console.log(`\n  /api/admin/users (dengan sesi admin): ${tanpaLogin.status()} ${tanpaLogin.status() === 200 ? "✅" : "⚠️"}`);

// ---- cek sampul tidak ter-cache sebagai 401 ----
const coverPalsu = await page.request.get(BASE + "/api/books/palsu/cover?w=320");
console.log(`  Sampul id palsu: ${coverPalsu.status()} · cf-cache-status: ${coverPalsu.headers()["cf-cache-status"] ?? "-"}`);
console.log(`  → respons error tidak boleh ter-cache (harus DYNAMIC/BYPASS, bukan HIT)`);

console.log(`\n${"═".repeat(52)}`);
console.log(gagal === 0 ? `✅ SEMUA ${halaman.length} HALAMAN SEHAT` : `❌ ${gagal} halaman bermasalah`);
console.log("═".repeat(52));

await browser.close();
process.exitCode = gagal === 0 ? 0 : 1;
