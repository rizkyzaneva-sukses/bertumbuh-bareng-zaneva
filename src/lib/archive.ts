import { prisma } from "./db";
import { AppError } from "./loans";

/**
 * Arsip buku.
 *
 * Bos: *"Sekalian tambahkan fitur arsipkan buku, takutnya saya butuh buat
 * pribadi"*.
 *
 * Bedanya dengan Hapus — ini yang penting dan sering salah dipahami:
 *
 * | | Arsip | Hapus |
 * |---|---|---|
 * | Muncul di rak anggota | tidak | tidak |
 * | Bisa dipinjam | tidak | tidak |
 * | Sampul tersimpan | ya | ikut hilang |
 * | Riwayat pinjam | utuh | ikut hilang |
 * | Progres baca anggota | utuh | ikut hilang |
 * | Bisa dibalikin | **ya, satu klik** | tidak |
 *
 * Jadi arsip = "buku ini saya simpan dulu", hapus = "buku ini memang dibuang".
 */

/** Filter untuk query yang hanya mau buku yang ADA DI RAK. */
export const RAK_FILTER = { archivedAt: null } as const;

/** Filter untuk query yang hanya mau buku yang DIARSIPKAN. */
export const ARSIP_FILTER = { archivedAt: { not: null } } as const;

export type ArchiveResult = { id: string; title: string; archived: boolean; activeLoans: number };

/**
 * Arsipkan / kembalikan buku ke rak.
 *
 * Aturan yang saya putuskan (dan alasannya):
 *
 *  - Mengarsipkan buku yang SEDANG DIPINJAM **diizinkan**. Justru ini kasus
 *    yang Bos maksud ("butuh buat pribadi"): buku diambil dari rak, tapi
 *    pinjaman yang berjalan tetap jalan sampai jatuh tempo dan tetap bisa
 *    dikembalikan / diperpanjang seperti biasa. Yang dilarang hanya pinjaman
 *    BARU.
 *  - Karena itu `activeLoans` dikembalikan supaya UI bisa memberi tahu admin
 *    berapa pinjaman yang masih berjalan.
 *  - Buku yang sudah diarsipkan lalu diarsipkan lagi = tidak error (idempoten),
 *    tanggal arsip pertama yang dipertahankan supaya tidak "muda lagi".
 */
export async function setArchived(bookId: string, archived: boolean, now = new Date()): Promise<ArchiveResult> {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: { id: true, title: true, archivedAt: true },
  });
  if (!book) throw new AppError("NOT_FOUND", "Buku tidak ditemukan", 404);

  const activeLoans = await prisma.loan.count({ where: { bookId, returnedAt: null } });

  // Sudah sesuai permintaan → jangan sentuh apa pun (termasuk jangan
  // memundurkan/memajukan tanggal arsip).
  const sudah = book.archivedAt !== null;
  if (sudah === archived) return { id: book.id, title: book.title, archived: sudah, activeLoans };

  await prisma.book.update({
    where: { id: book.id },
    data: { archivedAt: archived ? now : null },
  });

  console.log(`[arsip] "${book.title}" ${archived ? "diarsipkan" : "dikembalikan ke rak"} (pinjaman aktif: ${activeLoans})`);
  return { id: book.id, title: book.title, archived, activeLoans };
}

/** Buku yang boleh dipinjam: ada di rak DAN stoknya belum habis. */
export async function assertBorrowable(bookId: string) {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: { id: true, title: true, archivedAt: true },
  });
  if (!book) throw new AppError("BOOK_NOT_FOUND", "Buku tidak ditemukan", 404);
  if (book.archivedAt) throw new AppError("ARCHIVED", "Buku ini sudah diarsipkan dan tidak bisa dipinjam.", 409);
  return book;
}
