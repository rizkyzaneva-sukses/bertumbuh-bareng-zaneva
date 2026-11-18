import { prisma } from "./db";
import { effectiveStatus } from "./loans";
import { keyFromDbDate } from "./dates";

export type Reader = { userId: string; name: string };

export async function getDashboard(now = new Date()) {
  const [users, books, loans] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
    prisma.book.findMany({ orderBy: { title: "asc" } }),
    prisma.loan.findMany({ include: { book: { select: { id: true, title: true, author: true } } }, orderBy: { borrowedAt: "desc" } }),
  ]);

  const perUser = users.map((u) => {
    const mine = loans.filter((l) => l.userId === u.id);
    const finishedLoans = mine.filter((l) => l.returnedAt);
    const finishedBooks = new Map<string, { id: string; title: string; author: string; returnedAt: Date }>();
    for (const l of finishedLoans) if (!finishedBooks.has(l.bookId)) finishedBooks.set(l.bookId, { ...l.book, returnedAt: l.returnedAt! });
    const reading = mine
      .filter((l) => !l.returnedAt)
      .map((l) => ({ loanId: l.id, ...l.book, dueKey: keyFromDbDate(l.dueDate), status: effectiveStatus(l, now) }));
    return {
      userId: u.id,
      name: u.name,
      finished: [...finishedBooks.values()],
      finishedCount: finishedBooks.size,
      reading,
    };
  });

  const perBook = books.map((b) => {
    const forBook = loans.filter((l) => l.bookId === b.id);
    const readers = new Map<string, Reader>();
    for (const l of forBook.filter((x) => x.returnedAt)) readers.set(l.userId, { userId: l.userId, name: users.find((u) => u.id === l.userId)?.name ?? "?" });
    const readingNow = forBook
      .filter((l) => !l.returnedAt)
      .map((l) => ({ userId: l.userId, name: users.find((u) => u.id === l.userId)?.name ?? "?", dueKey: keyFromDbDate(l.dueDate), status: effectiveStatus(l, now) }));
    return {
      id: b.id,
      title: b.title,
      author: b.author,
      category: b.category,
      stock: b.stock,
      available: Math.max(0, b.stock - readingNow.length),
      readers: [...readers.values()],
      readingNow,
    };
  });

  const ranking = perUser
    .filter((u) => u.finishedCount > 0)
    .sort((a, b) => b.finishedCount - a.finishedCount || a.name.localeCompare(b.name))
    .map((u, i, arr) => {
      // peringkat kompetisi standar: nilai sama -> peringkat sama
      const rank = i > 0 && arr[i - 1].finishedCount === u.finishedCount ? -1 : i + 1;
      return { ...u, rank };
    });
  let last = 1;
  for (const r of ranking) {
    if (r.rank === -1) r.rank = last;
    else last = r.rank;
  }

  const active = loans.filter((l) => !l.returnedAt);
  return {
    totals: {
      books: books.length,
      copies: books.reduce((s, b) => s + b.stock, 0),
      members: users.length,
      reading: active.length,
      late: active.filter((l) => effectiveStatus(l, now) === "TERLAMBAT").length,
      finished: loans.filter((l) => l.returnedAt).length,
    },
    ranking,
    perUser,
    perBook,
  };
}
