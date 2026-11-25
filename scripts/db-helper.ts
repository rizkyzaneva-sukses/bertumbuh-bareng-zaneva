/**
 * Helper kecil untuk skrip uji di browser: baca data langsung dari DB.
 * Dipisah dari `tsx -e` karena escaping `$` / top-level await bikin ribet.
 *
 * Pakai: npx tsx scripts/db-helper.ts first-rak
 *        npx tsx scripts/db-helper.ts book <id>
 */
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

const [cmd, arg] = process.argv.slice(2);

try {
  if (cmd === "first-rak") {
    const b = await prisma.book.findFirst({
      where: { archivedAt: null },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    });
    if (!b) throw new Error("tidak ada buku di rak");
    console.log(JSON.stringify(b));
  } else if (cmd === "book") {
    const b = await prisma.book.findUnique({
      where: { id: arg },
      select: { title: true, archivedAt: true, _count: { select: { loans: true, progresses: true } } },
    });
    console.log(JSON.stringify(b));
  } else if (cmd === "siapkan-admin") {
    // Hanya untuk DB lokal: buat admin langsung bisa dipakai uji browser.
    // `seedAdmins()` sengaja memasang mustChangePassword=true, yang memunculkan
    // modal wajib-ganti-password dan MEMBLOKIR semua klik berikutnya di
    // Playwright (modal-nya menelan pointer event). Untuk uji otomatis modal itu
    // tidak ada gunanya, jadi dimatikan di sini.
    if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Hanya untuk database lokal");
    const hash = await hashPassword(arg || "Zaneva2026");
    const admins = await prisma.user.updateMany({
      where: { role: "ADMIN" },
      data: { passwordHash: hash, mustChangePassword: false, tempPassword: null },
    });
    console.log(JSON.stringify({ adminDiperbarui: admins.count }));
  } else {
    throw new Error(`perintah tidak dikenal: ${cmd}`);
  }
} finally {
  await prisma.$disconnect();
}
