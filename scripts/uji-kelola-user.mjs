// Uji UI kelola pengguna di browser sungguhan (Playwright + Chrome).
// 1. form Edit terbuka dengan nama & nomor HP terisi
// 2. ubah NAMA  -> tersimpan, tabel berubah
// 3. ubah NOMOR HP -> tersimpan & login pakai nomor BARU berhasil
// 4. nomor HP admin utama -> input dikunci (disabled)
// 5. hapus user uji -> hilang dari tabel
//
// Jalankan: node scripts/uji-kelola-user.mjs
import { chromium, devices } from "playwright";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "screens") + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const DB = "postgresql://bbz:" + String.fromCharCode(98, 98, 122) + "@localhost:54329/bbz";
const env = {
  ...process.env,
  DATABASE_URL: DB,
  SESSION_SECRET: "dev-secret-dev-secret-dev-secret-0123456789",
  APP_URL: BASE,
  DEFAULT_PASSWORD: "Zaneva2026",
  DISABLE_SCHEDULER: "1",
  PORT: "3100",
};

execSync(`npx tsx scripts/demo-data.ts`, { env, stdio: "inherit" });
execSync(`npx tsx scripts/db-helper.ts siapkan-admin Zaneva2026`, { env, stdio: "inherit" });

let server;
try {
  if (!(await fetch(BASE + "/api/health").then((r) => r.ok).catch(() => false))) {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3100"], { env, stdio: "pipe" });
    for (let i = 0; i < 90; i++) {
      try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "id-ID", timezoneId: "Asia/Jakarta" });
  const page = await ctx.newPage();
  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log("✓", name); }
    catch (e) { failed++; console.error("✗", name, "\n  ", e.message); }
  };

  await page.goto(BASE + "/login");
  await page.waitForSelector("#phone");
  await page.fill("#phone", "6281220210193");
  await page.fill("#password", "Zaneva2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  // ---- tambah user baru (fitur yang Bos minta) ----
  const NAMA = "Uji Kelola";
  const HP_AWAL = "081399900001";
  const HP_BARU = "081399900002";

  await step("TAMBAH user baru dari form", async () => {
    await page.goto(BASE + "/admin/pengguna");
    await page.waitForSelector('[data-testid="add-user-form"]', { timeout: 15000 });
    await page.fill('[data-testid="add-user-phone"]', HP_AWAL);
    await page.fill('[data-testid="add-user-name"]', NAMA);
    await page.click('[data-testid="add-user-form"] button[type="submit"]');
    await page.waitForSelector('[data-testid="add-user-result"]', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT + "user-1-tambah.png" });
    const html = await page.content();
    assert.ok(html.includes(NAMA), "user baru tidak muncul di daftar");
  });

  await step("EDIT: form terbuka dengan nama & nomor HP terisi", async () => {
    await page.goto(BASE + "/admin/pengguna");
    await page.waitForSelector('[data-testid="edit-user"]', { timeout: 15000 });
    // cari baris yang berisi NAMA lalu klik Edit di baris itu
    const baris = page.locator('[data-testid="user-row"]', { hasText: NAMA }).first();
    await baris.locator('[data-testid="edit-user"]').click();
    await page.waitForSelector('[data-testid="edit-user-form"]', { timeout: 10000 });
    const nm = await page.inputValue('[data-testid="edit-user-name"]');
    const hp = await page.inputValue('[data-testid="edit-user-phone"]');
    console.log(`   nama="${nm}" hp="${hp}"`);
    assert.equal(nm, NAMA);
    assert.equal(hp, HP_AWAL, "nomor HP tidak terisi otomatis");
    await page.screenshot({ path: OUT + "user-2-form-edit.png" });
  });

  await step("EDIT NAMA tersimpan", async () => {
    await page.fill('[data-testid="edit-user-name"]', NAMA + " Baru");
    await page.click('[data-testid="edit-user-save"]');
    await page.waitForTimeout(2500);
    const note = page.locator('[data-testid="user-note"]');
    if (await note.count()) console.log("   pesan:", (await note.innerText()).replace(/\n/g, " "));
    assert.ok((await page.content()).includes(NAMA + " Baru"), "nama baru tidak muncul di tabel");
  });

  await step("EDIT NOMOR HP tersimpan & bisa dipakai login", async () => {
    await page.goto(BASE + "/admin/pengguna");
    await page.waitForSelector('[data-testid="edit-user"]', { timeout: 15000 });
    const baris = page.locator('[data-testid="user-row"]', { hasText: NAMA + " Baru" }).first();
    await baris.locator('[data-testid="edit-user"]').click();
    await page.waitForSelector('[data-testid="edit-user-form"]', { timeout: 10000 });
    await page.fill('[data-testid="edit-user-phone"]', HP_BARU);
    await page.click('[data-testid="edit-user-save"]');
    await page.waitForTimeout(2500);

    // nomor baru HARUS bisa dipakai login (ini inti "nomor = username")
    const hpBaruTampil = await page.content();
    assert.ok(hpBaruTampil.includes(HP_BARU), "nomor baru tidak tampil di tabel");

    // buktikan lewat API: login pakai nomor BARU
    const temp = execSync(`npx tsx scripts/db-helper.ts temp-pw ${HP_BARU}`, { env, encoding: "utf8" })
      .trim().split("\n").pop();
    const pw = JSON.parse(temp).tempPassword;
    const loginCtx = await browser.newContext({ ...devices["iPhone 13"] });
    const lp = await loginCtx.newPage();
    await lp.goto(BASE + "/login");
    await lp.waitForSelector("#phone");
    await lp.fill("#phone", HP_BARU);
    await lp.fill("#password", pw);
    await lp.click('button[type="submit"]');
    await lp.waitForTimeout(2500);
    const url = lp.url();
    console.log(`   login nomor baru → ${url}`);
    assert.ok(!url.includes("/login"), `login dengan nomor baru GAGAL (masih di ${url})`);
    await loginCtx.close();
    await page.screenshot({ path: OUT + "user-3-nomor-baru.png" });
  });

  await step("nomor HP admin utama DIKUNCI di form (celah proteksi)", async () => {
    await page.goto(BASE + "/admin/pengguna");
    await page.waitForSelector('[data-testid="edit-user"]', { timeout: 15000 });
    const baris = page.locator('[data-testid="user-row"]', { hasText: "0812-2021-0193" }).first();
    if (!(await baris.count())) {
      // Cari lewat chip Admin kalau format tampilan berbeda
      const adminRow = page.locator('[data-testid="user-row"]', { hasText: "Admin" }).first();
      await adminRow.locator('[data-testid="edit-user"]').click();
    } else {
      await baris.locator('[data-testid="edit-user"]').click();
    }
    await page.waitForSelector('[data-testid="edit-user-form"]', { timeout: 10000 });
    const disabled = await page.locator('[data-testid="edit-user-phone"]').first().isDisabled();
    console.log(`   input nomor admin utama disabled=${disabled}`);
    assert.equal(disabled, true, "nomor admin utama harus dikunci");
    await page.screenshot({ path: OUT + "user-4-nomor-dikunci.png" });
  });

  await step("HAPUS user uji", async () => {
    await page.goto(BASE + "/admin/pengguna");
    await page.waitForSelector('[data-testid="delete-user"]', { timeout: 15000 });
    const baris = page.locator('[data-testid="user-row"]', { hasText: NAMA + " Baru" }).first();
    assert.ok(await baris.count() > 0, "baris user uji harus ada sebelum dihapus");
    page.once("dialog", (d) => d.accept());
    await baris.locator('[data-testid="delete-user"]').click();
    await page.waitForTimeout(3000);
    // Periksa TABEL-nya saja, bukan seluruh halaman: pesan sukses
    // ("<nama> dihapus.") mengandung nama yang sama dan akan membuat
    // assertion ini gagal padahal penghapusan berhasil.
    const sisaBaris = await page.locator('[data-testid="user-row"]', { hasText: NAMA + " Baru" }).count();
    console.log(`   baris tersisa=${sisaBaris}`);
    assert.equal(sisaBaris, 0, "user uji masih ada di tabel setelah dihapus");
  });

  await browser.close();
  console.log(failed === 0 ? "\nSEMUA LANGKAH LOLOS" : `\n${failed} LANGKAH GAGAL`);
  process.exit(failed === 0 ? 0 : 1);
} finally {
  server?.kill();
}
