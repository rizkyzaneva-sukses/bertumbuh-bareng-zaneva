-- Seragamkan tempo semua pinjaman aktif: 7 hari kerja, hari pertama = Jumat 27 Nov 2026
-- Hasil hitung: hari 1 Jumat 27, 2 Sabtu 28, (Ahad 29 dilewati), 3 Senin 30,
-- 4 Selasa 1 Des, 5 Rabu 2, 6 Kamis 3, 7 Jumat 4 Des 2026.
UPDATE "Loan"
SET "dueDate" = DATE '2026-12-04'
WHERE "returnedAt" IS NULL
  AND "dueDate" <> DATE '2026-12-04';

SELECT COUNT(*) AS sisa_belum_seragam
FROM "Loan"
WHERE "returnedAt" IS NULL AND "dueDate" <> DATE '2026-12-04';
