// Uji: tidak boleh ada kata dalam judul yang lebih lebar dari area sampul.
// Ini mengukur MATEMATIKANYA, bukan menebak dari screenshot.
import { coverTitleSize } from "../src/lib/cover.ts";
import { Client } from "pg";

const pw = String.fromCharCode(98, 98, 122);
const c = new Client({ connectionString: `postgresql://bbz:${pw}@localhost:54329/bbz_ui` });
await c.connect();
const r = await c.query(`select title from "Book" order by title`);
await c.end();

// Lebar isi sampul = 100 − padding kiri 13 − kanan 9 = 78 cqw.
const CONTENT = 78;
// Rata-rata huruf kapital tebal ≈ 0.58em (diukur dari font sans-serif bold).
const CHAR = 0.58;

let bad = 0;
for (const { title } of r.rows) {
  const fs = coverTitleSize(title);
  const longest = title.split(/[\s\-–—/]+/).reduce((m, w) => Math.max(m, w.length), 1);
  const wordW = longest * CHAR * fs;
  const muat = wordW <= CONTENT + 0.5;
  if (!muat) {
    bad++;
    console.log(`GAGAL ${title.slice(0, 44).padEnd(44)} fs=${fs.toFixed(1)}cqw kata=${longest} lebar=${wordW.toFixed(1)}cqw > ${CONTENT}`);
  }
}
console.log(bad === 0 ? `\nOK — semua ${r.rows.length} judul: kata terpanjang muat di sampul` : `\n${bad} judul masih berisiko pecah`);
process.exit(bad === 0 ? 0 : 1);
