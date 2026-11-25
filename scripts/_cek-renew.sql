SELECT
  l."renewCount",
  COUNT(*) AS jumlah,
  MIN(l."dueDate") AS tempo_terawal,
  MAX(l."dueDate") AS tempo_terakhir
FROM "Loan" l
WHERE l.status = 'DIPINJAM'
GROUP BY l."renewCount"
ORDER BY l."renewCount";
