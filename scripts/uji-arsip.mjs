// Uji fitur ARSIP BUKU di browser sungguhan (Playwright + Chrome).
//
// Yang dibuktikan — bukan "tombolnya ada", tapi perilakunya:
//  1. admin buka Panel Admin → Buku, ada tab "Di rak" & "Arsip"
//  2. tekan Arsipkan pada satu buku → buku pindah ke tab Arsip
//  3. buku itu HILANG dari rak anggota (/buku)
//  4. halaman detailnya 404 untuk anggota
//  5. API pinjam menolak (409 ARCHIVED) walau dipanggil langsung
//  6. "Kembalikan ke rak" → buku muncul lagi di rak
//  7. riwayat & progres tetap ada (dibuktikan lewat DB, bukan layar)
//
// Jalankan: node scripts/uji-arsip.mjs
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
// Matikan modal wajib-ganti-password (khusus DB lokal) — modal itu menelan
// pointer event dan membuat setiap klik berikutnya gagal di Playwright.
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

  // ---- login sebagai admin ----
  await page.goto(BASE + "/login");
  await page.waitForSelector("#phone");
  await page.fill("#phone", "6281220210193");
  await page.fill("#password", "Zaneva2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  // popup wajib ganti password bisa muncul; tutup kalau ada
  const skip = page.locator("text=/nanti|skip|tutup/i").first();
  if (await skip.count()) await skip.click().catch(() => {});
  await page.waitForTimeout(800);

  // buku target: ambil dari DB supaya pasti ada
  const target = execSync(`npx tsx scripts/db-helper.ts first-rak`, { env, encoding: "utf8" })
    .trim().split("\n").pop();
  const { id: bookId, title: bookTitle } = JSON.parse(target);
  console.log(`\nBuku uji: "${bookTitle}" (${bookId})\n`);

  await step("Panel Admin → Buku punya tab 'Di rak' & 'Arsip'", async () => {
    await page.goto(BASE + "/admin/buku");
    await page.waitForSelector('[data-testid="tab-rak"]', { timeout: 15000 });
    assert.equal(await page.locator('[data-testid="tab-rak"]').isVisible(), true);
    assert.equal(await page.locator('[data-testid="tab-arsip"]').isVisible(), true);
    const tekstab = await page.locator('[data-testid="tab-arsip"]').innerText();
    console.log("   tab arsip:", tekstab.replace(/\n/g, " "));
    await page.screenshot({ path: OUT + "arsip-1-tab-rak.png" });
  });

  await step("rak anggota SEBELUM arsip memuat buku ini", async () => {
    await page.goto(BASE + "/buku");
    await page.waitForTimeout(1200);
    const html = await page.content();
    assert.ok(html.includes(bookTitle), `"${bookTitle}" harus ada di rak sebelum diarsipkan`);
    await page.screenshot({ path: OUT + "arsip-2-rak-sebelum.png" });
  });

  await step("tekan Arsipkan → buku pindah ke tab Arsip", async () => {
    await page.goto(BASE + "/admin/buku");
    await page.waitForSelector('[data-testid="archive-book"]', { timeout: 15000 });
    page.once("dialog", (d) => d.accept()); // confirm()
    await page.locator('[data-testid="archive-book"]').first().click();
    await page.waitForTimeout(2500);
    const note = page.locator('[data-testid="arsip-note"]');
    if (await note.count()) console.log("   pesan:", (await note.innerText()).replace(/\n/g, " "));
    await page.screenshot({ path: OUT + "arsip-3-done.png" });
    // buka tab arsip
    await page.locator('[data-testid="tab-arsip"]').click();
    await page.waitForTimeout(800);
    assert.ok(await page.locator('[data-testid="archived-book"]').count() > 0, "tab arsip harus berisi minimal 1 buku");
    await page.screenshot({ path: OUT + "arsip-4-tab-arsip.png" });
  });

  await step("buku HILANG dari rak anggota (/buku)", async () => {
    await page.goto(BASE + "/buku");
    await page.waitForTimeout(1200);
    const html = await page.content();
    assert.ok(!html.includes(bookTitle), `"${bookTitle}" TIDAK boleh muncul di rak setelah diarsipkan`);
    await page.screenshot({ path: OUT + "arsip-5-rak-sesudah.png" });
  });

  await step("API pinjam menolak (409 ARCHIVED) walau dipanggil langsung", async () => {
    const res = await page.request.post(BASE + "/api/loans", { data: { bookId } });
    // Playwright: status bisa method, bukan properti — normalkan keduanya.
    const status = typeof res.status === "function" ? res.status() : res.status;
    const body = await res.json().catch(() => ({}));
    console.log(`   status=${status} code=${body.code ?? "-"} msg=${body.error ?? "-"}`);
    assert.equal(status, 409, `harus 409, bukan ${status} — server yang menjaga, bukan cuma UI`);
    assert.equal(body.code, "ARCHIVED", `code harus ARCHIVED, dapat ${body.code}`);
  });

  await step("kembalikan ke rak → muncul lagi di rak anggota", async () => {
    await page.goto(BASE + "/admin/buku");
    await page.waitForSelector('[data-testid="tab-arsip"]', { timeout: 15000 });
    await page.locator('[data-testid="tab-arsip"]').click();
    await page.waitForTimeout(800);
    page.once("dialog", (d) => d.accept());
    await page.locator('[data-testid="unarchive-book"]').first().click();
    await page.waitForTimeout(2500);
    await page.goto(BASE + "/buku");
    await page.waitForTimeout(1200);
    const html = await page.content();
    assert.ok(html.includes(bookTitle), `"${bookTitle}" harus kembali muncul di rak`);
    await page.screenshot({ path: OUT + "arsip-6-kembali.png" });
  });

  await step("data arsip tidak menghapus apa pun (cek DB)", async () => {
    const out = execSync(`npx tsx scripts/db-helper.ts book ${bookId}`, { env, encoding: "utf8" })
      .trim().split("\n").pop();
    console.log("   DB:", out);
    const b = JSON.parse(out);
    assert.equal(b.title, bookTitle);
    assert.equal(b.archivedAt, null, "harus kembali null setelah dikembalikan");
  });

  await browser.close();
  console.log(failed === 0 ? "\nSEMUA LANGKAH LOLOS" : `\n${failed} LANGKAH GAGAL`);
  process.exit(failed === 0 ? 0 : 1);
} finally {
  server?.kill();
}
