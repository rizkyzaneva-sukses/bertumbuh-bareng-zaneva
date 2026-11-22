import "dotenv/config";
import { seedAdmins, seedBooks, seedBooksOnce, seedVerifiedCovers } from "../src/lib/seed";
import { prisma } from "../src/lib/db";

// npm run db:seed           -> admin awal + katalog (katalog hanya sekali) + sampul terverifikasi
// npm run seed:books        -> tambahkan buku katalog yang judulnya belum ada
async function main() {
  const onlyBooks = process.argv.includes("--books");
  if (onlyBooks) {
    console.log(`Buku ditambahkan: ${await seedBooks()}`);
  } else {
    await seedAdmins();
    console.log(`Admin siap. Buku katalog ditambahkan: ${await seedBooksOnce()}`);
  }
  // Idempoten: hanya mengisi sampul yang masih kosong, tidak menimpa unggahan admin.
  console.log(`Sampul asli dipasang: ${await seedVerifiedCovers()}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
