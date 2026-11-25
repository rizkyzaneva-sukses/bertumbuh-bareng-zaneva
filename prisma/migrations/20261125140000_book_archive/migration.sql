-- Arsip buku.
--
-- Bos: *"Sekalian tambahkan fitur arsipkan buku, takutnya saya butuh buat
-- pribadi"*.
--
-- Arsip BUKAN hapus. Buku diarsipkan:
--   - hilang dari rak anggota & tidak bisa dipinjam
--   - sampul, riwayat pinjam, riwayat baca, dan progres TETAP utuh
--   - bisa dikembalikan ke rak kapan saja tanpa kehilangan apa pun
-- Hapus (DELETE) tetap ada untuk buku yang memang dibuang permanen.
--
-- Ditulis IDEMPOTENT: aman dijalankan berulang. Tidak ada DROP.

ALTER TABLE "Book" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Book_archivedAt_idx" ON "Book"("archivedAt");
