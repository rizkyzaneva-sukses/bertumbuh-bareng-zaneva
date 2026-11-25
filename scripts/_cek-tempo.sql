SELECT u.name, l."borrowedAt", l."dueDate", b.title
FROM "Loan" l
JOIN "User" u ON u.id = l."userId"
JOIN "Book" b ON b.id = l."bookId"
WHERE l.status = 'DIPINJAM'
ORDER BY l."borrowedAt";
