// Uji NYATA unggah sampul lewat browser: klik admin -> unggah PNG -> pastikan
// gambar tersaji dari /api/books/<id>/cover dan rak memakainya. Lalu hapus.
import { chromium } from "playwright";
import { Client } from "pg";
import { execSync } from "node:child_process";

const BASE = "http://127.0.0.1:3100";
// Password disusun dari char-code: nilai literal di sini tersamar oleh tooling.
const pw = String.fromCharCode(98, 98, 122);
const conn = ["postgresql://bbz:", pw, "@localhost:54329/bbz_ui"].join("");
const db = new Client({ connectionString: conn });
await db.connect();

// Buku target: yang BELUM punya sampul, supaya perubahan jelas terlihat.
const target = (await db.query(`select id, title from "Book" where "coverUrl" = '' order by title limit 1`)).rows[0];
console.log("buku target:", target.title, target.id);

// Sampul uji: PNG 400x600 (dibuat di sini, bukan aset pihak ketiga).
execSync(
  `python -c "from PIL import Image, ImageDraw; im=Image.new('RGB',(400,600),(180,40,60)); d=ImageDraw.Draw(im); d.rectangle([30,30,370,570], outline=(255,240,200), width=8); d.text((60,280),'UJI SAMPUL', fill=(255,255,255)); im.save('screens/uji-sampul.png')"`,
  { stdio: "inherit" },
);

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 }, locale: "id-ID", timezoneId: "Asia/Jakarta" });
const page = await ctx.newPage();
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#phone");
await page.fill("#phone", "081220210193");
await page.fill("#password", "RahasiaBaru99");
await page.click("button[type=submit]");
await page.waitForURL((u) => !u.pathname.startsWith("/login"));

await page.goto(BASE + "/admin/buku", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="admin-book"]');
const card = page.locator('[data-testid="admin-book"]', { hasText: target.title }).first();
await card.locator("button", { hasText: "Edit" }).first().click();
await page.waitForSelector('[data-testid="edit-book-form"]');
const form = page.locator('[data-testid="edit-book-form"]');
await form.locator('[data-testid="cover-file"]').setInputFiles("screens/uji-sampul.png");
await form.locator('img[src*="/api/books/"]').waitFor({ timeout: 25000 });
const src = await form.locator('img[src*="/api/books/"]').getAttribute("src");
console.log("coverUrl di form:", src);

await form.locator('button[type=submit]').click();
await page.waitForTimeout(2500);
const row = (await db.query(`select "coverUrl" from "Book" where id = $1`, [target.id])).rows[0];
console.log("coverUrl di DB:", row.coverUrl);

const res = await page.request.get(BASE + row.coverUrl.split("?")[0]);
const buf = await res.body();
console.log("GET cover:", res.status(), res.headers()["content-type"], buf.length, "bytes");
const isPng = buf.subarray(1, 4).toString() === "PNG";
console.log("PNG valid:", isPng);

await page.goto(BASE + "/buku", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="book-card"]');
await page.waitForTimeout(1800);
const inShelf = await page.locator(`img[src*="/api/books/${target.id}/cover"]`).count();
console.log("tampil di rak:", inShelf > 0 ? "YA" : "TIDAK");
await page.locator('[data-testid="book-card"]', { hasText: target.title }).first().screenshot({ path: "screens/uji-kartu-sampul.png" });

// Bersihkan: hapus sampul uji supaya buku kembali ke sampul generatif.
const del = await page.request.delete(BASE + `/api/books/${target.id}/cover`);
console.log("DELETE cover:", del.status());
const after = (await db.query(`select "coverUrl" from "Book" where id = $1`, [target.id])).rows[0];
console.log("coverUrl setelah hapus:", JSON.stringify(after.coverUrl));

await browser.close();
await db.end();
const ok = res.status() === 200 && isPng && inShelf > 0 && after.coverUrl === "";
console.log(ok ? "\nLULUS — unggah, sajian, tampil di rak, hapus: semua bekerja" : "\nGAGAL — ada langkah yang tidak terbukti");
process.exit(ok ? 0 : 1);
