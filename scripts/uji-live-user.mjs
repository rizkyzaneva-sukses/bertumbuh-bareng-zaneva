/**
 * Uji kelola user DI LIVE (books.maulanacorp.biz.id) pakai akun Bos.
 * Password dari ENV.
 *
 * Bukti yang diambil:
 *  1. tambah user
 *  2. edit nama
 *  3. edit nomor HP → login pakai nomor BARU berhasil
 *  4. nomor HP admin utama DITOLAK (celah proteksi tertutup)
 *  5. hapus user → bersih
 */
const BASE = process.env.BASE ?? "https://books.maulanacorp.biz.id";
const PHONE = process.env.LIVE_PHONE ?? "081220210193";
const PASS = process.env.LIVE_PASS;
if (!PASS) { console.error("LIVE_PASS kosong"); process.exit(1); }

let cookie = "";
let failed = 0;
const ok = (m) => console.log("✓", m);
const bad = (m, e) => { failed++; console.error("✗", m, "\n  ", e?.message ?? e ?? ""); };
const assert = (c, m) => { if (!c) throw new Error(m); };

async function call(path, method = "GET", json) {
  const headers = { "User-Agent": "uji-user/1.0", Origin: BASE };
  if (cookie) headers.cookie = cookie;
  let body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  const res = await fetch(BASE + path, { method, headers, body, redirect: "manual" });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    if (/Max-Age=0/i.test(c)) continue;
    cookie = c.split(";")[0];
  }
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json().catch(() => ({})) : await res.text();
  return { status: res.status, data };
}

const step = async (n, f) => { try { await f(); ok(n); } catch (e) { bad(n, e); } };

const HP_AWAL = "081399910001";
const HP_BARU = "081399910002";
const NAMA = "ZZ Uji User";
let uid;

await step("login admin", async () => {
  const r = await call("/api/auth/login", "POST", { phone: PHONE, password: PASS });
  console.log(`   status=${r.status} role=${r.data.role}`);
  assert(r.status === 200, `login gagal ${r.status}`);
});

await step("TAMBAH user", async () => {
  const r = await call("/api/admin/users/invite", "POST", { phone: HP_AWAL, name: NAMA, role: "MEMBER", password: "UjiUser2026" });
  console.log(`   status=${r.status} ${r.data.error ?? ""}`);
  assert(r.status === 200 || r.status === 201, `gagal tambah: ${r.status} ${r.data.error ?? ""}`);
  uid = r.data.user?.id;
  assert(uid, "id user tidak dikembalikan");
});

await step("EDIT NAMA", async () => {
  const r = await call(`/api/admin/users/${uid}`, "PATCH", { name: NAMA + " Baru" });
  console.log(`   status=${r.status} nama="${r.data.user?.name ?? ""}"`);
  assert(r.status === 200, `gagal: ${r.status} ${r.data.error ?? ""}`);
  assert(r.data.user.name === NAMA + " Baru", "nama tidak berubah");
});

await step("EDIT NOMOR HP", async () => {
  const r = await call(`/api/admin/users/${uid}`, "PATCH", { phone: HP_BARU });
  console.log(`   status=${r.status} phone=${r.data.user?.phone ?? ""}`);
  assert(r.status === 200, `gagal: ${r.status} ${r.data.error ?? ""}`);
  assert(r.data.user.phone === "62" + HP_BARU.slice(1), `nomor tidak ternormalisasi: ${r.data.user.phone}`);
});

await step("LOGIN pakai nomor BARU berhasil (inti: nomor = username)", async () => {
  // Jangan pakai cookie admin — pakai request bersih.
  const res = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ phone: HP_BARU, password: "UjiUser2026" }),
    redirect: "manual",
  });
  const body = await res.json().catch(() => ({}));
  console.log(`   status=${res.status} role=${body.role ?? "-"}`);
  assert(res.status === 200, `login nomor baru GAGAL: ${res.status} ${body.error ?? ""}`);
});

await step("nomor admin utama DITOLAK diubah (celah proteksi tertutup)", async () => {
  // Cari id admin utama lewat daftar? Endpoint GET /api/admin/users dipakai UI.
  const list = await call("/api/admin/users");
  const users = list.data.users ?? [];
  const seed = users.find((u) => u.phone === "6281220210193");
  assert(seed, "admin utama tidak ditemukan di daftar");
  const r = await call(`/api/admin/users/${seed.id}`, "PATCH", { phone: "089900000000" });
  console.log(`   status=${r.status} code=${r.data.code ?? "-"} msg=${r.data.error ?? "-"}`);
  assert(r.status === 400, `harus 400, dapat ${r.status} — CELAH MASIH TERBUKA`);
  assert(r.data.code === "SEED", `code harus SEED, dapat ${r.data.code}`);
});

await step("HAPUS user uji", async () => {
  const r = await call(`/api/admin/users/${uid}`, "DELETE");
  console.log(`   status=${r.status} ${r.data.error ?? ""}`);
  assert(r.status === 200, `gagal hapus: ${r.status} ${r.data.error ?? ""}`);
  const list = await call("/api/admin/users");
  const masih = (list.data.users ?? []).some((u) => u.id === uid);
  assert(!masih, "user uji masih ada setelah dihapus");
});

console.log(failed === 0 ? "\n=== SEMUA LOLOS DI LIVE ===" : `\n=== ${failed} GAGAL ===`);
process.exit(failed === 0 ? 0 : 1);
