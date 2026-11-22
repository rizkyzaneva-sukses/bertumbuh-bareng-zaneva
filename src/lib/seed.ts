import fs from "node:fs";
import path from "node:path";
import { prisma } from "./db";
import { defaultPassword, hashPassword } from "./password";
import { normalizePhone } from "./phone";
import { normalizeCategory } from "./categories";
import { VERIFIED_COVERS } from "./book-covers";

export const SEED_ADMINS = [
  { name: "Rizky", phone: "081220210193" },
  // Nama dikosongkan supaya pemilik nomor mengisi sendiri saat login pertama.
  { name: "", phone: "085177555437" },
];

export const SEED_ADMIN_PHONES = SEED_ADMINS.map((a) => normalizePhone(a.phone)!);

/** Buat admin awal kalau belum ada. Tidak menimpa password admin yang sudah ada. */
export async function seedAdmins() {
  const pw = defaultPassword();
  const hash = await hashPassword(pw);
  for (const a of SEED_ADMINS) {
    const phone = normalizePhone(a.phone)!;
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      if (existing.role !== "ADMIN") await prisma.user.update({ where: { phone }, data: { role: "ADMIN" } });
      continue;
    }
    await prisma.user.create({
      data: { name: a.name, phone, passwordHash: hash, tempPassword: pw, role: "ADMIN", mustChangePassword: true },
    });
  }
}

type CatalogRow = { title: string; author: string; category: string; relevansi: string; alasan: string };

function loadCatalog(): CatalogRow[] {
  const file = path.join(process.cwd(), "prisma", "data", "katalog.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Sinopsis dari kolom "Alasan Dipilih" + "Relevansi Fungsi" di katalog Excel. Jumlah halaman sengaja dikosongkan. */
export function synopsisFor(r: CatalogRow): string {
  const rel = r.relevansi && r.relevansi !== "Semua fungsi" ? ` Cocok untuk: ${r.relevansi}.` : r.relevansi ? " Cocok untuk semua fungsi." : "";
  return `${r.alasan}${rel}`.trim();
}

/** Tambah buku katalog yang judulnya belum ada. Tidak menimpa edit admin. */
export async function seedBooks() {
  let added = 0;
  for (const r of loadCatalog()) {
    const exists = await prisma.book.findFirst({ where: { title: r.title } });
    if (exists) continue;
    await prisma.book.create({
      data: {
        title: r.title,
        author: r.author,
        category: normalizeCategory(r.category),
        synopsis: synopsisFor(r),
        stock: 1,
        pages: null,
      },
    });
    added++;
  }
  return added;
}

/** Seed katalog hanya sekali (supaya buku yang dihapus admin tidak muncul lagi saat redeploy). */
export async function seedBooksOnce() {
  const flag = await prisma.setting.findUnique({ where: { key: "books_seeded" } });
  if (flag) return 0;
  const added = await seedBooks();
  await prisma.setting.create({ data: { key: "books_seeded", value: new Date().toISOString() } });
  return added;
}

/**
 * Pasang sampul asli (terverifikasi) ke buku yang sudah ada — idempoten dan
 * TIDAK menimpa sampul yang sudah diunggah admin (`coverUrl` kosong saja).
 *
 * Aman dijalankan tiap boot container: buku yang sudah punya gambar dilewati,
 * jadi unggahan admin tidak pernah hilang karena redeploy.
 */
export async function seedVerifiedCovers() {
  let applied = 0;
  for (const [title, url] of Object.entries(VERIFIED_COVERS)) {
    // Judul di DB produksi kadang berupa versi panjang ("Deep Work: Cara Berhasil
    // Fokus …") sementara katalog menyimpan yang pendek ("Deep Work"). Cocokkan
    // exact dulu, lalu awalan judul — jangan sampai sampul tertukar buku.
    const exact = await prisma.book.updateMany({ where: { title, coverUrl: "" }, data: { coverUrl: url } });
    if (exact.count > 0) {
      applied += exact.count;
      continue;
    }
    const prefix = await prisma.book.updateMany({
      where: { title: { startsWith: `${title}:` }, coverUrl: "" },
      data: { coverUrl: url },
    });
    applied += prefix.count;
  }
  return applied;
}
