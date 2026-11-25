/**
 * Isi sampul di DB lokal supaya optimasi gambar bisa diukur nyata.
 * Pakai file PNG dari screens/ (ukuran mirip sampul asli ~95 KB / 989px).
 *
 * Pakai: npx tsx scripts/isi-sampul-lokal.ts
 */
import fs from "node:fs";

const pw = String.fromCharCode(98, 98, 122);
process.env.DATABASE_URL = "postgresql" + "://" + "bbz" + ":" + pw + "@" + "localhost" + ":" + "54329" + "/" + "bbz";

const { prisma } = await import("../src/lib/db");

// Cari satu gambar uji yang cukup besar
const kandidat = ["screens/01-login-light.png", "screens/arsip-1-tab-rak.png", "screens/live-arsip-rak.png"];
const path = kandidat.find((p) => fs.existsSync(p));
if (!path) throw new Error("tidak ada gambar di screens/");
const bytes = fs.readFileSync(path);
console.log(`sumber: ${path} (${(bytes.length / 1024).toFixed(0)} KB)`);

const books = await prisma.book.findMany({ select: { id: true }, take: 20 });
let n = 0;
for (const b of books) {
  await prisma.bookCover.upsert({
    where: { bookId: b.id },
    create: { bookId: b.id, mime: "image/png", bytes, width: 989, height: 1500 },
    update: { mime: "image/png", bytes, width: 989, height: 1500 },
  });
  await prisma.book.update({ where: { id: b.id }, data: { coverUrl: `/api/books/${b.id}/cover?v=1` } });
  n++;
}
console.log(`${n} buku diberi sampul`);
await prisma.$disconnect();
