// Cetak hasil coverTheme() untuk seluruh buku nyata: apa warnanya & seberapa terang?
// Dipakai untuk mengukur variasi, bukan menebak dari screenshot.
import { Client } from "pg";
import { coverTheme, coverPattern } from "../src/lib/cover.ts";

const pw = String.fromCharCode(98, 98, 122);
const c = new Client({ connectionString: `postgresql://bbz:${pw}@localhost:54329/bbz_ui` });
await c.connect();
const r = await c.query(`select id, title, category, "coverUrl" from "Book" order by category, title`);

const rows = r.rows.map((b) => {
  const t = coverTheme(b.category, b.id);
  const m = /hsl\((\d+) (\d+)% (\d+)%\)/.exec(t.a);
  return {
    title: b.title,
    cat: b.category,
    hue: m ? Number(m[1]) : -1,
    light: m ? Number(m[3]) : -1,
    adaGambar: b.coverUrl !== "",
    pat: coverPattern(b.id),
  };
});

console.log("\n===== PER BUKU =====");
for (const x of rows) {
  console.log(
    `${String(x.hue).padStart(3)}° L${String(x.light).padStart(3)}% pat${x.pat} ${x.adaGambar ? "IMG" : "gen"} | ${x.cat.slice(0, 18).padEnd(18)} | ${x.title.slice(0, 42)}`,
  );
}

// Ringkasan: berapa banyak latar TERANG (L>=70) vs gelap?
const terang = rows.filter((x) => x.light >= 70).length;
const gelap = rows.filter((x) => x.light < 40).length;
const sedang = rows.length - terang - gelap;
console.log(`\n===== RINGKASAN =====\nterang=${terang} sedang=${sedang} gelap=${gelap} dari ${rows.length}`);

// Per kategori: apakah hue benar-benar menyebar?
const perCat = new Map();
for (const x of rows) {
  if (!perCat.has(x.cat)) perCat.set(x.cat, []);
  perCat.get(x.cat).push(x);
}
console.log("\n===== SEBARAN HUE PER KATEGORI =====");
for (const [cat, items] of perCat) {
  const hues = items.map((i) => i.hue);
  const spread = Math.max(...hues) - Math.min(...hues);
  console.log(`${cat.slice(0, 24).padEnd(24)} n=${String(items.length).padStart(2)} hue=${hues.join(",")} sebaran=${spread}°`);
}
await c.end();
