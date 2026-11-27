import "dotenv/config";
import { saveProgress, getTodayReading, getReadingHistory } from "../src/lib/reading";
import { prisma } from "../src/lib/db";

/**
 * Uji logika log harian tanpa lewat UI: pastikan delta halaman dihitung benar
 * dan rekap hari ini menjawab "siapa baca berapa halaman, buku apa".
 */
async function main() {
  const book = await prisma.book.findFirst({ where: { title: "Atomic Habits" }, select: { id: true, pages: true, title: true } });
  const book2 = await prisma.book.findFirst({ where: { title: "Deep Work" }, select: { id: true, pages: true, title: true } });
  const user = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, name: true } });
  if (!book || !book2 || !user) throw new Error("data uji tidak lengkap");

  // Mulai bersih untuk hari ini
  await prisma.readingLog.deleteMany({ where: { userId: user.id } });
  await prisma.readingProgress.deleteMany({ where: { userId: user.id } });

  console.log(`Buku: ${book.title} (${book.pages} hlm), ${book2.title} (${book2.pages} hlm)`);

  // Skenario Bos: hari ini catat "sampai halaman 40"
  await saveProgress(user.id, book.id, 40);
  console.log("catat 40  -> log seharusnya 40");

  // Siang: lanjut sampai 65 (delta 25, total hari ini 65)
  await saveProgress(user.id, book.id, 65);
  console.log("catat 65  -> log seharusnya 65");

  // Salah ketik: koreksi turun ke 60 (delta negatif -> diabaikan, tetap 65)
  await saveProgress(user.id, book.id, 60);
  console.log("koreksi 60 -> log harus TETAP 65 (delta negatif diabaikan)");

  // Buku kedua, 25 halaman
  await saveProgress(user.id, book2.id, 25);
  console.log("buku2 25  -> total hari ini 90");

  // Idempoten: catat angka sama lagi -> tidak menambah
  await saveProgress(user.id, book.id, 60);
  console.log("ulang 60  -> total harus TETAP 90");

  const logs = await prisma.readingLog.findMany({ where: { userId: user.id }, include: { book: { select: { title: true } } } });
  console.log("\n--- isi ReadingLog ---");
  for (const l of logs) console.log(`  ${l.dayKey} | ${l.book.title} | pagesRead=${l.pagesRead} lastPage=${l.lastPage}`);

  const today = await getTodayReading();
  console.log("\n--- getTodayReading ---");
  console.log(`hari=${today.dayKey} sudah=${today.sudah} belum=${today.belum} totalHalaman=${today.totalHalaman}`);
  for (const r of today.readers) {
    console.log(`  ${r.status} | ${r.name} | ${r.totalPages} hlm | ${r.books.map((b) => `${b.title} ${b.pagesRead}hlm(sampai ${b.lastPage})`).join(", ")}`);
  }

  const hist = await getReadingHistory(user.id, 7);
  console.log("\n--- riwayat 7 hari ---");
  for (const h of hist) console.log(`  ${h.dayKey}: ${h.pages} hlm ${h.books.map((b) => b.title).join(",")}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
