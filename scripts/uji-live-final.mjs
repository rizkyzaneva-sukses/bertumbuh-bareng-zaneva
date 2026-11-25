/**
 * Uji LIVE (bukan lokal): arsip buku + foto bukti pengembalian.
 * Pakai akun Bos yang diberikan langsung, password dibaca dari ENV.
 *
 * Yang dibuktikan:
 *  1. login berhasil
 *  2. rute arsip benar-benar ada di server yang jalan (bukan cuma di repo)
 *  3. arsipkan buku uji → hilang dari /api/books
 *  4. pinjam buku arsip → 409 ARCHIVED
 *  5. kembalikan → muncul lagi
 *  6. alur foto bukti: pinjam → kembalikan → unggah foto → ambil foto → byte sama
 *  7. bersihkan semua data uji (user, buku, pinjaman, bukti)
 *
 * Jalankan: LIVE_PASS=... node scripts/uji-live-final.mjs
 */
const BASE = process.env.BASE ?? "https://books.maulanacorp.biz.id";
const PHONE = process.env.LIVE_PHONE ?? "081220210193";
const PASS = process.env.LIVE_PASS;

if (!PASS) {
  console.error("LIVE_PASS belum diisi");
  process.exit(1);
}

let cookie = "";
let failed = 0;
const ok = (m) => console.log("✓", m);
const bad = (m, e) => { failed++; console.error("✗", m, "\n  ", e?.message ?? e ?? ""); };

async function call(path, method = "GET", json, form) {
  const headers = { "User-Agent": "uji-live/1.0", Origin: BASE };
  if (cookie) headers.cookie = cookie;
  let body;
  if (form) body = form;
  else if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  const res = await fetch(BASE + path, { method, headers, body, redirect: "manual" });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    if (/Max-Age=0/i.test(c)) continue;
    cookie = c.split(";")[0];
  }
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json().catch(() => ({})) : await res.arrayBuffer();
  return { status: res.status, data, ct };
}

const step = async (name, fn) => { try { await fn(); ok(name); } catch (e) { bad(name, e); } };
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// ---- 1. login ----
let role;
await step("login pakai akun Bos", async () => {
  const r = await call("/api/auth/login", "POST", { phone: PHONE, password: PASS });
  console.log(`   status=${r.status} role=${r.data.role ?? "-"}`);
  assert(r.status === 200, `login gagal: ${r.status} ${r.data.error ?? ""}`);
  role = r.data.role;
  assert(role === "ADMIN", `butuh ADMIN, dapat ${role}`);
});

await step("rute arsip ADA di server yang jalan (bukan 404)", async () => {
  const r = await call("/api/books/tidak-ada/archive", "POST", { archived: true });
  console.log(`   status=${r.status} code=${r.data.code ?? "-"}`);
  // 404 = rutenya ada tapi bukunya tidak ada. 405/HTML = rutenya tidak ada.
  assert(r.status === 404, `harus 404 (buku tidak ada), dapat ${r.status} — rute arsip mungkin belum ter-deploy`);
  assert(r.data.code === "NOT_FOUND", `code harus NOT_FOUND, dapat ${r.data.code}`);
});

// ---- 2. buku uji ----
const judul = `ZZ Uji Arsip ${Date.now()}`;
let bookId;

await step("buat buku uji sementara", async () => {
  const r = await call("/api/books", "POST", {
    title: judul, author: "Uji Otomatis", pages: 100, category: "", synopsis: "buku uji, akan dihapus", stock: 1, coverUrl: "",
  });
  assert(r.status === 201, `gagal buat buku: ${r.status} ${r.data.error ?? ""}`);
  bookId = r.data.book.id;
  console.log(`   bookId=${bookId}`);
});

// ---- 3. arsip ----
await step("arsipkan → hilang dari daftar buku publik", async () => {
  const a = await call(`/api/books/${bookId}/archive`, "POST", { archived: true });
  console.log(`   arsip status=${a.status} pesan="${a.data.pesan ?? a.data.error ?? ""}"`);
  assert(a.status === 200, `arsip gagal: ${a.status}`);
  const list = await call("/api/books");
  const ada = (list.data.books ?? []).some((b) => b.id === bookId);
  assert(!ada, "buku arsip masih muncul di /api/books");
});

await step("pinjam buku arsip → ditolak 409 ARCHIVED", async () => {
  const r = await call("/api/loans", "POST", { bookId });
  console.log(`   status=${r.status} code=${r.data.code ?? "-"}`);
  assert(r.status === 409, `harus 409, dapat ${r.status}`);
  assert(r.data.code === "ARCHIVED", `code harus ARCHIVED, dapat ${r.data.code}`);
});

await step("kembalikan ke rak → muncul lagi", async () => {
  const r = await call(`/api/books/${bookId}/archive`, "POST", { archived: false });
  assert(r.status === 200, `gagal: ${r.status}`);
  const list = await call("/api/books");
  assert((list.data.books ?? []).some((b) => b.id === bookId), "buku tidak muncul lagi setelah dikembalikan");
});

// ---- 4. alur foto bukti ----
let loanId;
// Pakai PNG asli (>1 KB) karena API menolak berkas < 1024 byte sebagai
// "sepertinya bukan foto" — itu validasi yang benar, jadi uji harus pakai
// gambar sungguhan. Ambil dari tangkapan layar repo.
import fs from "node:fs";
const kandidat = ["screens/01-login-light.png", "screens/arsip-1-tab-rak.png"];
const fotoPath = kandidat.find((p) => fs.existsSync(p));
if (!fotoPath) throw new Error("tidak ada gambar uji > 1KB");
const foto = fs.readFileSync(fotoPath);
const foto2 = Buffer.concat([foto, Buffer.from([0, 0])]); // byte berbeda untuk uji "ganti foto"
console.log(`   gambar uji: ${fotoPath} (${foto.length} byte)`);

await step("pinjam buku uji", async () => {
  const r = await call("/api/loans", "POST", { bookId });
  assert(r.status === 201, `gagal pinjam: ${r.status} ${r.data.error ?? ""}`);
  loanId = r.data.loan.id;
  console.log(`   loanId=${loanId} jatuhTempo=${r.data.loan.dueDate}`);
});

await step("unggah foto SEBELUM dikembalikan → ditolak 409", async () => {
  const fd = new FormData();
  fd.append("file", new Blob([foto], { type: "image/png" }), "bukti.png");
  const r = await call(`/api/loans/${loanId}/proof`, "POST", undefined, fd);
  console.log(`   status=${r.status} code=${r.data.code ?? "-"}`);
  assert(r.status === 409, `harus 409 (belum dikembalikan), dapat ${r.status}`);
});

await step("kembalikan buku", async () => {
  const r = await call(`/api/loans/${loanId}/return`, "POST", {});
  assert(r.status === 200, `gagal kembalikan: ${r.status} ${r.data.error ?? ""}`);
});

await step("unggah foto bukti → tersimpan", async () => {
  const fd = new FormData();
  fd.append("file", new Blob([foto], { type: "image/png" }), "bukti.png");
  const r = await call(`/api/loans/${loanId}/proof`, "POST", undefined, fd);
  console.log(`   status=${r.status} size=${r.data.sizeBytes ?? r.data.proof?.sizeBytes ?? "-"} mime=${r.data.proof?.mime ?? r.data.mime ?? "-"}`);
  assert(r.status === 200 || r.status === 201, `gagal unggah: ${r.status} ${r.data.error ?? ""}`);
});

await step("foto bisa diambil lagi & byte-nya identik", async () => {
  const r = await call(`/api/loans/${loanId}/proof`);
  const got = Buffer.from(r.data);
  console.log(`   status=${r.status} ct=${r.ct} bytes=${got.length}`);
  assert(r.status === 200, `gagal ambil: ${r.status}`);
  assert(got.equals(foto), `byte tidak identik (${got.length} vs ${foto.length})`);
});

await step("unggah ulang MENGGANTI, bukan menumpuk", async () => {
  const fd = new FormData();
  fd.append("file", new Blob([foto2], { type: "image/png" }), "bukti2.png");
  const up = await call(`/api/loans/${loanId}/proof`, "POST", undefined, fd);
  assert(up.status === 200 || up.status === 201, `gagal unggah ulang: ${up.status}`);
  const got = Buffer.from((await call(`/api/loans/${loanId}/proof`)).data);
  console.log(`   bytes sekarang=${got.length}`);
  assert(got.equals(foto2), "foto lama tidak terganti");
});

// ---- 5. bersihkan ----
await step("hapus buku uji → semua data uji ikut bersih", async () => {
  const r = await call(`/api/books/${bookId}`, "DELETE");
  console.log(`   status=${r.status} ${r.data.error ?? ""}`);
  assert(r.status === 200, `gagal hapus buku uji: ${r.status} ${r.data.error ?? ""}`);
  const list = await call("/api/books");
  assert(!(list.data.books ?? []).some((b) => b.id === bookId), "buku uji masih ada!");
  assert(!(list.data.books ?? []).some((b) => b.title === judul), "buku uji masih ada (judul)!");
});

console.log(failed === 0 ? "\n=== SEMUA LOLOS DI LIVE ===" : `\n=== ${failed} LANGKAH GAGAL ===`);
process.exit(failed === 0 ? 0 : 1);
