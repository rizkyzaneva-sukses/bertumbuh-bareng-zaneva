// Screenshot untuk PDF panduan v2: halaman baru (usulan buku, notifikasi) + nav "Dasbor".
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3123";
const OUT = "D:/tmp/bbz/out/shots";
const PHONE = "628130000001";
const PW = "Rahasia12345";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 900 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "id-ID",
  timezoneId: "Asia/Jakarta",
  permissions: ["notifications"],
});
const p = await ctx.newPage();
const log = (...a) => console.log(...a);

// Headless Chrome selalu melaporkan Notification.permission = "denied" sehingga
// UI menampilkan kartu "Izin diblokir" — bukan tampilan yang dilihat pengguna baru.
// Untuk screenshot panduan kita paksa state "default" (= belum diaktifkan),
// supaya tombol "Aktifkan notifikasi" yang asli ikut terfoto.
await p.addInitScript(() => {
  const N = function () {};
  N.permission = "default";
  N.requestPermission = () => Promise.resolve("granted");
  Object.defineProperty(window, "Notification", { value: N, configurable: true });
});

const r = await ctx.request.post(`${BASE}/api/auth/login`, {
  data: { phone: PHONE, password: PW },
});
log("login", r.status());

// ---------- 1. Halaman /usulan : form usul buku ----------
await p.goto(`${BASE}/usulan`, { waitUntil: "networkidle" });
await sleep(2000);
await p.screenshot({ path: `${OUT}/13-usulan.png` });
log("13-usulan ok");

// ---------- 2. Halaman /notifikasi : tombol aktifkan ----------
await p.goto(`${BASE}/notifikasi`, { waitUntil: "networkidle" });
await sleep(2000);
await p.screenshot({ path: `${OUT}/14-notifikasi.png` });
log("14-notifikasi ok");

// ---------- 3. Profil : pintasan Usulan Buku & Notifikasi ----------
await p.goto(`${BASE}/profil`, { waitUntil: "networkidle" });
await sleep(2000);
await p.screenshot({ path: `${OUT}/15-profil.png` });
log("15-profil ok");

// ---------- 4. Bottom nav close-up (bukti label Dasbor) ----------
await p.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await sleep(1800);
const navBox = await p.evaluate(() => {
  const nav = document.querySelector("nav.bottomnav");
  if (!nav) return null;
  const b = nav.getBoundingClientRect();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
});
log("navBox:", JSON.stringify(navBox));
if (navBox) {
  await p.screenshot({
    path: `${OUT}/16-nav-dasbor.png`,
    clip: { x: navBox.x, y: Math.max(0, navBox.y - 6), width: navBox.w, height: navBox.h + 12 },
  });
  log("16-nav-dasbor ok");
}

// ---------- 5. Beranda fresh (untuk cover) ----------
await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
await sleep(2000);
await p.screenshot({ path: `${OUT}/03-beranda.png` });
log("03-beranda ok");

await browser.close();
log("SELESAI");
