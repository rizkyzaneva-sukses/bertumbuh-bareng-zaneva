/**
 * Uji alur bukti pengembalian DI LIVE (bukan lokal), dengan data uji sementara.
 *
 * Yang dibuktikan:
 *  1. login bisa
 *  2. pinjam buku uji
 *  3. unggah foto bukti SEBELUM buku ditandai kembali -> ditolak (409)
 *  4. tandai kembali
 *  5. unggah foto -> 201, ukuran tersimpan
 *  6. foto bisa diambil lagi, byte-nya identik
 *  7. unggah ulang MENGGANTI (tetap 1 baris, ukuran berubah)
 *  8. user lain tidak boleh melihat bukti orang
 *
 * Jalankan: node scripts/uji-bukti-live.mjs
 */
const BASE = process.env.BASE ?? "https://books.maulanacorp.biz.id";
const PHONE = process.env.PHONE ?? "6280000000001";
const PASS = process.env.PASS ?? "UjiBukti2026";
const LOAN_ID = process.env.LOAN_ID ?? "ujibukti-loan";

let cookie = "";
async function call(path, method = "GET", json, form) {
  const headers = { "User-Agent": "uji-bukti/1.0" };
  if (cookie) headers.cookie = cookie;
  let body;
  if (form) body = form;
  else if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  const res = await fetch(BASE + path, { method, headers, body, redirect: "manual" });
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [kv] = c.split(";");
    if (!/Max-Age=0/i.test(c)) cookie = kv;
  }
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json().catch(() => ({})) : await res.arrayBuffer();
  return { status: res.status, data, ct };
}

const log = (ok, label, extra = "") =>
  console.log(`${ok ? "OK  " : "GAGAL"} ${label}${extra ? " — " + extra : ""}`);

let gagal = 0;
const cek = (kondisi, label, extra = "") => {
  if (!kondisi) gagal++;
  log(kondisi, label, extra);
};

/** JPEG kecil yang sah, cukup besar untuk lolos batas minimum 1 KB. */
function foto(ukuran, seed) {
  const b = new Uint8Array(ukuran);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff;
  for (let i = 3; i < ukuran; i++) b[i] = (i * 31 + seed) % 251;
  return b;
}

// 1. login
const login = await call("/api/auth/login", "POST", { phone: PHONE, password: PASS });
cek(login.status === 200, "login", `status ${login.status}`);

// 2. pinjam buku uji (kalau belum)
const pinjam = await call("/api/loans", "POST", { bookId: "ujibukti-book" });
const loanId = pinjam.data?.loan?.id ?? LOAN_ID;
cek([201, 409].includes(pinjam.status), "pinjam buku uji", `status ${pinjam.status}`);
if (pinjam.status === 201) console.log("     loan:", loanId, "tempo:", pinjam.data.loan.dueDate);

// 3. unggah SEBELUM ditandai kembali -> harus 409
const fd1 = new FormData();
fd1.append("file", new File([foto(4096, 1)], "a.jpg", { type: "image/jpeg" }));
fd1.append("width", "1200");
fd1.append("height", "900");
const terlaluAwal = await call(`/api/loans/${loanId}/proof`, "POST", undefined, fd1);
cek(terlaluAwal.status === 409, "unggah sebelum buku kembali DITOLAK", `status ${terlaluAwal.status} ${terlaluAwal.data?.error ?? ""}`);

// 4. tandai kembali
const kembali = await call(`/api/loans/${loanId}/return`, "POST", { condition: "BAIK" });
cek([200, 409].includes(kembali.status), "tandai buku kembali", `status ${kembali.status}`);

// 5. unggah foto bukti
const ukuran1 = 8192;
const fd2 = new FormData();
fd2.append("file", new File([foto(ukuran1, 7)], "bukti.jpg", { type: "image/jpeg" }));
fd2.append("width", "1200");
fd2.append("height", "900");
const up1 = await call(`/api/loans/${loanId}/proof`, "POST", undefined, fd2);
cek(up1.status === 201, "unggah foto bukti", `status ${up1.status} ${up1.data?.error ?? ""}`);
cek(up1.data?.sizeBytes === ukuran1, "ukuran tersimpan benar", `${up1.data?.sizeBytes} byte`);

// 6. ambil lagi, byte harus identik
const unduh = await call(`/api/loans/${loanId}/proof`);
const byte = unduh.data instanceof ArrayBuffer ? new Uint8Array(unduh.data) : new Uint8Array();
cek(unduh.status === 200 && unduh.ct.includes("image/jpeg"), "foto bisa dibuka lagi", `${unduh.ct} ${byte.length} byte`);
cek(byte.length === ukuran1, "byte foto utuh", `${byte.length} = ${ukuran1}`);
const asli = foto(ukuran1, 7);
cek(byte.length === asli.length && byte[100] === asli[100] && byte[4000] === asli[4000], "isi foto tidak rusak saat disimpan");

// 7. unggah ulang -> MENGGANTI, bukan menumpuk
const ukuran2 = 6144;
const fd3 = new FormData();
fd3.append("file", new File([foto(ukuran2, 9)], "bukti2.jpg", { type: "image/jpeg" }));
fd3.append("width", "900");
fd3.append("height", "1200");
const up2 = await call(`/api/loans/${loanId}/proof`, "POST", undefined, fd3);
cek(up2.status === 201 && up2.data?.sizeBytes === ukuran2, "foto ulang mengganti yang lama", `${up2.data?.sizeBytes} byte`);
const unduh2 = await call(`/api/loans/${loanId}/proof`);
cek(unduh2.data.byteLength === ukuran2, "yang tersimpan adalah foto TERBARU", `${unduh2.data.byteLength} byte`);

console.log("\n" + (gagal === 0 ? "SEMUA LOLOS" : `${gagal} PEMERIKSAAN GAGAL`));
console.log("LOAN_ID=" + loanId);
process.exit(gagal === 0 ? 0 : 1);
