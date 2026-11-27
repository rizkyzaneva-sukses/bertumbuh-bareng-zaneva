-- Backfill ReadingLog dari ReadingProgress untuk hari ini (WIB).
-- Aman dijalankan karena seluruh baris ReadingProgress dibuat hari ini,
-- sehingga lastPage == jumlah halaman yang dibaca hari ini.
INSERT INTO "ReadingLog" (id, "userId", "bookId", "dayKey", "pagesRead", "lastPage", "createdAt", "updatedAt")
SELECT
  'bf_' || replace(gen_random_uuid()::text, '-', ''),
  rp."userId",
  rp."bookId",
  to_char((rp."updatedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD'),
  rp."lastPage",
  rp."lastPage",
  now(),
  now()
FROM "ReadingProgress" rp
WHERE rp."lastPage" > 0
ON CONFLICT ("userId", "bookId", "dayKey") DO NOTHING;

SELECT "dayKey", count(*) AS baris, sum("pagesRead") AS total_halaman
FROM "ReadingLog" GROUP BY "dayKey" ORDER BY "dayKey" DESC;
