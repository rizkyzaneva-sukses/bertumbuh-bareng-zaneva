// Uji UI + tangkapan layar (Playwright, Chrome). Jalankan: node scripts/ui-check.mjs
// Butuh: Postgres lokal (npm run localpg), build produksi, dan server di BASE (default http://localhost:3100).
import { chromium, devices } from "playwright";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = new URL("../screens/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const DB = "postgresql://bbz:bbz@localhost:54329/bbz";
const env = { ...process.env, DATABASE_URL: DB, SESSION_SECRET: "dev-secret-dev-secret-dev-secret-0123456789", APP_URL: BASE, DEFAULT_PASSWORD: "Zaneva2026", DISABLE_SCHEDULER: "1", PORT: "3100" };

// data awal: DB kosong + admin + katalog + riwayat baca contoh
execSync(`npx tsx scripts/demo-data.ts`, { env, stdio: "inherit" });
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3100"], { env, stdio: "pipe" });
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ channel: "chrome" });
const phone = devices["iPhone 13"];
let failed = 0;
const step = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { failed++; console.error("✗", name, "\n ", e.message); } };

async function newCtx(scheme) {
  return browser.newContext({ ...phone, colorScheme: scheme, locale: "id-ID", timezoneId: "Asia/Jakarta", serviceWorkers: "allow" });
}

try {
  const ctx = await newCtx("light");
  const page = await ctx.newPage();
  await step("login: halaman muncul (light) + screenshot", async () => {
    await page.goto(BASE + "/login");
    await page.waitForSelector("#phone");
    assert.equal(await page.getAttribute("html", "data-theme"), "light");
    await page.screenshot({ path: OUT + "01-login-light.png" });
  });
  await step("login admin: popup wajib ganti password tidak bisa ditutup", async () => {
    await page.fill("#phone", "081220210193");
    await page.fill("#password", "Zaneva2026");
    await page.click("button[type=submit]");
    await page.waitForSelector('[data-testid="force-password-modal"]');
    await page.screenshot({ path: OUT + "02-ganti-password-wajib-light.png" });
    await page.keyboard.press("Escape");
    assert.ok(await page.isVisible('[data-testid="force-password-modal"]'));
    await page.goto(BASE + "/buku"); // pindah halaman: popup tetap ada
    await page.waitForSelector('[data-testid="force-password-modal"]');
  });
  await step("ganti password lewat popup", async () => {
    await page.fill("#np1", "pendek");
    await page.fill("#np2", "pendek");
    await page.click('[data-testid="force-password-modal"] button[type=submit]');
    assert.match(await page.textContent('[role=alert]'), /minimal 8/);
    await page.fill("#np1", "RahasiaBaru99");
    await page.fill("#np2", "RahasiaBaru99");
    await page.click('[data-testid="force-password-modal"] button[type=submit]');
    await page.waitForSelector('[data-testid="force-password-modal"]', { state: "detached" });
  });
  await step("admin: tambah anggota massal lewat UI + password sementara tampil", async () => {
    await page.goto(BASE + "/admin/pengguna");
    await page.fill('textarea[name=list]', "Sinta Dewi, 0812-3456-7890\nBudi Santoso, +62 857 1111 2222\nCitra Lestari, 089912345678");
    await page.fill("#bulkpw", "Sementara1");
    await page.click('[data-testid="bulk-form"] button[type=submit]');
    await page.waitForSelector('[data-testid="bulk-result"]');
    assert.match(await page.textContent('[data-testid="bulk-result"]'), /3 akun dibuat/);
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="user-row"]').length >= 5);
    assert.ok((await page.locator('[data-testid="temp-pw"]', { hasText: "Sementara1" }).count()) >= 3);
    await page.screenshot({ path: OUT + "05-admin-pengguna-light.png", fullPage: false });
  });
  await step("admin: tambah, edit, hapus buku lewat UI", async () => {
    await page.goto(BASE + "/admin/buku");
    await page.click('[data-testid="toggle-add-book"]');
    const f = page.locator('[data-testid="add-book-form"]');
    await f.locator("input[name=title]").fill("Buku Uji UI");
    await f.locator("input[name=author]").fill("Penguji");
    await f.locator("input[name=stock]").fill("2");
    await f.locator("button[type=submit]").click();
    await page.waitForSelector('[data-testid="admin-book"]:has-text("Buku Uji UI")');
    page.once("dialog", (d) => d.accept());
    await page.locator('[data-testid="admin-book"]:has-text("Buku Uji UI") [data-testid="delete-book"]').click();
    await page.waitForSelector('[data-testid="admin-book"]:has-text("Buku Uji UI")', { state: "detached" });
  });
  await ctx.close();

  // ---- anggota (Sinta) di HP, mode terang ----
  const ctx2 = await newCtx("light");
  const p2 = await ctx2.newPage();
  await step("anggota: login pakai nomor 08xx, ganti password, pinjam 2 buku, batas ke-3 ditolak", async () => {
    await p2.goto(BASE + "/login");
    await p2.fill("#phone", "081234567890");
    await p2.fill("#password", "Sementara1");
    await p2.click("button[type=submit]");
    await p2.waitForSelector('[data-testid="force-password-modal"]');
    await p2.fill("#np1", "SintaBaru123");
    await p2.fill("#np2", "SintaBaru123");
    await p2.click('[data-testid="force-password-modal"] button[type=submit]');
    await p2.waitForSelector('[data-testid="force-password-modal"]', { state: "detached" });
    await p2.goto(BASE + "/buku");
    await p2.fill('[data-testid="search"]', "habits");
    p2.on("dialog", (d) => d.accept());
    const card = (t) => p2.locator('[data-testid="book-card"]', { hasText: t });
    await card("Atomic Habits").locator('[data-testid="borrow"]').click();
    await p2.waitForSelector("text=Berhasil dipinjam");
    await p2.fill('[data-testid="search"]', "deep work");
    await card("Deep Work").locator('[data-testid="borrow"]').click();
    await p2.waitForSelector("text=Berhasil dipinjam");
    await p2.fill('[data-testid="search"]', "");
    await p2.waitForSelector("text=slot pinjammu penuh");
    assert.ok(await card("Essentialism").locator('[data-testid="borrow"]').isDisabled());
    await p2.goto(BASE + "/");
    assert.equal((await p2.textContent('[data-testid="slot-used"]')).trim(), "2/2");
    await p2.screenshot({ path: OUT + "03-beranda-light.png" });
  });
  await step("katalog (light) screenshot", async () => {
    await p2.goto(BASE + "/buku");
    await p2.waitForSelector('[data-testid="book-card"]');
    await p2.screenshot({ path: OUT + "04-katalog-light.png" });
  });
  await step("anggota tidak bisa membuka panel admin", async () => {
    await p2.goto(BASE + "/admin/pengguna");
    assert.equal(new URL(p2.url()).pathname, "/");
  });
  await step("tema: toggle gelap tersimpan & dipakai di halaman berikutnya + PWA terpasang", async () => {
    await p2.goto(BASE + "/profil");
    for (let i = 0; i < 3 && (await p2.getAttribute("html", "data-theme")) !== "dark"; i++) await p2.click('[data-testid="theme-toggle"] >> nth=0');
    assert.equal(await p2.getAttribute("html", "data-theme"), "dark");
    await p2.goto(BASE + "/dashboard?tab=ranking");
    assert.equal(await p2.getAttribute("html", "data-theme"), "dark");
    await p2.screenshot({ path: OUT + "06-dashboard-ranking-dark.png" });
    await p2.goto(BASE + "/dashboard?tab=orang");
    await p2.locator('[data-testid="person"]').first().click();
    await p2.screenshot({ path: OUT + "07-dashboard-orang-dark.png" });
    await p2.goto(BASE + "/buku");
    await p2.waitForSelector('[data-testid="book-card"]');
    await p2.screenshot({ path: OUT + "08-katalog-dark.png" });
    const manifestHref = await p2.getAttribute('link[rel=manifest]', "href");
    assert.equal(manifestHref, "/manifest.webmanifest");
    assert.equal(await p2.getAttribute('link[rel=apple-touch-icon]', "href"), "/apple-touch-icon.png");
    const reg = await p2.evaluate(async () => { await navigator.serviceWorker.ready; return !!(await navigator.serviceWorker.getRegistration()); });
    assert.ok(reg, "service worker terdaftar");
  });
  await step("sistem gelap -> otomatis gelap (default ikuti sistem)", async () => {
    const c = await newCtx("dark");
    const pg = await c.newPage();
    await pg.goto(BASE + "/login");
    assert.equal(await pg.getAttribute("html", "data-theme"), "dark");
    await pg.screenshot({ path: OUT + "09-login-dark.png" });
    await c.close();
  });
  await step("balikin buku dari beranda", async () => {
    await p2.goto(BASE + "/");
    await p2.locator('[data-testid="my-loan"]').first().locator('[data-testid="return"]').click();
    await p2.waitForFunction(() => document.querySelectorAll('[data-testid="my-loan"]').length === 1);
  });
  await ctx2.close();

  // ---- halaman link pengembalian ----
  await step("halaman link pengembalian: tombol 'Balikin sekarang' (sekali pakai)", async () => {
    const out = execSync(`npx tsx scripts/make-return-link.ts`, { env, encoding: "utf8" }).trim().split("\n").pop();
    const c = await newCtx("light");
    const pg = await c.newPage();
    await pg.goto(out);
    await pg.waitForSelector('[data-testid="return-now"]');
    await pg.screenshot({ path: OUT + "10-link-balikin-light.png" });
    await pg.click('[data-testid="return-now"]');
    await pg.waitForSelector('[data-testid="return-done"]');
    await pg.reload();
    await pg.waitForSelector('[data-testid="return-invalid"]');
    await c.close();
  });
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
console.log(failed ? `\n${failed} langkah gagal` : "\nSemua langkah UI lulus");
process.exit(failed ? 1 : 0);
