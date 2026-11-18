import "dotenv/config";
import { seedAdmins, seedBooks, seedBooksOnce } from "../src/lib/seed";
import { prisma } from "../src/lib/db";

// npm run db:seed           -> admin awal + katalog (katalog hanya sekali)
// npm run seed:books        -> tambahkan buku katalog yang judulnya belum ada
async function main() {
  const onlyBooks = process.argv.includes("--books");
  if (onlyBooks) {
    console.log(`Buku ditambahkan: ${await seedBooks()}`);
  } else {
    await seedAdmins();
    console.log(`Admin siap. Buku katalog ditambahkan: ${await seedBooksOnce()}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
