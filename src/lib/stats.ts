import { prisma } from "./db";
import { effectiveStatus } from "./loan-status";
import { RAK_FILTER } from "./archive";
import { keyFromDbDate } from "./dates";
import { displayPhone } from "./phone";
import { toProgressView, type ProgressView } from "./reading";

/** Nama tampilan: kalau orangnya belum mengisi nama, pakai nomor HP. */
const label = (name: string, phone: string) => name.trim() || displayPhone(phone);

export type Reader = { userId: string; name: string; finishedAt: Date | null };

/**
 * Angka dashboard.
 *
 * PENTING — "selesai dibaca" dihitung dari **penanda beres baca** (progres
 * bacaan atau jawaban WA), BUKAN dari "buku sudah dikembalikan". Buku yang
 * kembali ke rak belum tentu selesai dibaca: orang bisa mengembalikan karena
 * kepepet jatuh tempo sambil menandai "belum selesai".
 *
 * Karena itu juga buku yang sedang dipinjam tetap bisa terhitung selesai kalau
 * orangnya sudah menandai beres (dibaca di kantor, lalu dikembalikan belakangan).
 */
export async function getDashboard(now = new Date()) {
  const [users, books, loans, progresses] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
    prisma.book.findMany({ where: RAK_FILTER, orderBy: { title: "asc" } }),
    prisma.loan.findMany({ include: { book: { select: { id: true, title: true, author: true } } }, orderBy: { borrowedAt: "desc" } }),
    prisma.readingProgress.findMany({
      include: { book: { select: { id: true, title: true, author: true } } },
      orderBy: [{ finishedAt: "desc" }],
    }),
  ]);

  const userLabel = (id: string) => {
    const f = users.find((x) => x.id === id);
    return f ? label(f.name, f.phone) : "?";
  };

  const progByUserBook = new Map<string, ProgressView>();
  for (const p of progresses) progByUserBook.set(`${p.userId}:${p.bookId}`, toProgressView(p));

  // Kelompokkan SEKALI, bukan `loans.filter()` di dalam loop user.
  // Sebelumnya: perUser = users.map(... loans.filter(...)) → O(user × pinjaman)
  // dan perBook = books.map(... loans.filter(...)) → O(buku × pinjaman).
  // Dengan 36 user × 52 buku × ratusan pinjaman itu jadi ribuan pembandingan
  // per satu kali buka halaman. Sekarang sekali jalan, lalu O(1) per baris.
  const loansByUser = new Map<string, typeof loans>();
  const loansByBook = new Map<string, typeof loans>();
  for (const l of loans) {
    const forUser = loansByUser.get(l.userId);
    if (forUser) forUser.push(l);
    else loansByUser.set(l.userId, [l]);
    const forBook = loansByBook.get(l.bookId);
    if (forBook) forBook.push(l);
    else loansByBook.set(l.bookId, [l]);
  }

  const prosesByUser = new Map<string, typeof progresses>();
  const prosesByBook = new Map<string, typeof progresses>();
  for (const p of progresses) {
    const arr = prosesByUser.get(p.userId);
    if (arr) arr.push(p);
    else prosesByUser.set(p.userId, [p]);
    const perBuku = prosesByBook.get(p.bookId);
    if (perBuku) perBuku.push(p);
    else prosesByBook.set(p.bookId, [p]);
  }

  const perUser = users.map((u) => {
    const mine = loansByUser.get(u.id) ?? [];
    const punyaku = prosesByUser.get(u.id) ?? [];
    const doneProgress = punyaku.filter((p) => p.status === "SELESAI");
    const finishedBooks = doneProgress.map((p) => ({
      id: p.book.id,
      title: p.book.title,
      author: p.book.author,
      finishedAt: p.finishedAt,
    }));
    const reading = mine
      .filter((l) => !l.returnedAt)
      .map((l) => ({
        loanId: l.id,
        ...l.book,
        dueKey: keyFromDbDate(l.dueDate),
        status: effectiveStatus(l, now),
        renewCount: l.renewCount,
        progress: progByUserBook.get(`${u.id}:${l.bookId}`) ?? null,
      }));
    // Buku yang SUDAH kembali ke rak, dikelompokkan per buku (bukan per transaksi).
    // Dipisah dari `reading` supaya UI bisa menyembunyikannya di balik collapse:
    // yang dicari orang sehari-hari adalah "sedang kupinjam", bukan tumpukan riwayat.
    const readingIds = new Set(reading.map((r) => r.id));
    const returnedMap = new Map<
      string,
      { id: string; title: string; author: string; lastReturnedAt: Date | null; times: number }
    >();
    for (const l of mine) {
      if (!l.returnedAt) continue;
      const cur = returnedMap.get(l.bookId);
      if (!cur) {
        returnedMap.set(l.bookId, {
          id: l.bookId,
          title: l.book.title,
          author: l.book.author,
          lastReturnedAt: l.returnedAt,
          times: 1,
        });
      } else {
        cur.times += 1;
        if (!cur.lastReturnedAt || l.returnedAt > cur.lastReturnedAt) cur.lastReturnedAt = l.returnedAt;
      }
    }
    const returned = [...returnedMap.values()]
      .filter((b) => !readingIds.has(b.id))
      .map((b) => ({ ...b, finished: progByUserBook.get(`${u.id}:${b.id}`)?.status === "SELESAI" }))
      .sort((a, b) => (b.lastReturnedAt?.getTime() ?? 0) - (a.lastReturnedAt?.getTime() ?? 0));
    // Buku yang sedang dipegang tapi progresnya masih berjalan — ditampilkan
    // terpisah supaya jelas mana yang "lagi dibaca" vs "sedang dipinjam".
    return {
      userId: u.id,
      name: label(u.name, u.phone),
      finished: finishedBooks,
      finishedCount: finishedBooks.length,
      reading,
      returned,
    };
  });

  const perBook = books.map((b) => {
    const forBook = loansByBook.get(b.id) ?? [];
    const readerMap = new Map<string, Reader>();
    // Progres per buku juga dikelompokkan sekali di luar, bukan difilter
    // ulang untuk tiap buku.
    for (const p of prosesByBook.get(b.id) ?? []) {
      if (p.status === "SELESAI")
        readerMap.set(p.userId, { userId: p.userId, name: userLabel(p.userId), finishedAt: p.finishedAt });
    }
    const readingNow = forBook
      .filter((l) => !l.returnedAt)
      .map((l) => ({
        userId: l.userId,
        name: userLabel(l.userId),
        dueKey: keyFromDbDate(l.dueDate),
        status: effectiveStatus(l, now),
        progress: progByUserBook.get(`${l.userId}:${b.id}`) ?? null,
      }));
    return {
      id: b.id,
      title: b.title,
      author: b.author,
      category: b.category,
      pagesTotal: b.pages,
      stock: b.stock,
      available: Math.max(0, b.stock - readingNow.length),
      readers: [...readerMap.values()],
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
  const finishedTotal = progresses.filter((p) => p.status === "SELESAI").length;
  const finishedPeople = new Set(progresses.filter((p) => p.status === "SELESAI").map((p) => p.userId)).size;
  // Hitung per (orang, buku), BUKAN per transaksi: satu orang yang meminjam
  // buku yang sama dua kali tetap satu bacaan yang belum tuntas.
  const returnedPairs = new Set(loans.filter((l) => l.returnedAt).map((l) => `${l.userId}:${l.bookId}`));
  const returnedUnfinished = [...returnedPairs].filter(
    (key) => (progByUserBook.get(key)?.status ?? "SEDANG_DIBACA") !== "SELESAI",
  ).length;
  return {
    totals: {
      books: books.length,
      copies: books.reduce((s, b) => s + b.stock, 0),
      members: users.length,
      reading: active.length,
      late: active.filter((l) => effectiveStatus(l, now) === "TERLAMBAT").length,
      /** berapa buku yang benar-benar sudah tuntas dibaca (semua orang) */
      finished: finishedTotal,
      /** berapa orang yang punya minimal satu buku tuntas */
      finishedPeople,
      /** progres yang masih berjalan, walau bukunya sudah kembali */
      inProgress: progresses.filter((p) => p.status === "SEDANG_DIBACA").length,
      /** pasangan orang×buku yang bukunya kembali ke rak tapi belum ditandai beres */
      returnedUnfinished,
    },
    ranking,
    perUser,
    perBook,
  };
}

/**
 * Angka ringkas untuk BERANDA — hanya yang benar-benar ditampilkan.
 *
 * Kenapa dipisah dari `getDashboard()`: Beranda cuma butuh dua hal (jumlah
 * buku selesai milik sendiri + peringkat), tapi sebelumnya memanggil
 * `getDashboard()` yang menarik SEMUA pinjaman, SEMUA progres, SEMUA user, dan
 * SEMUA buku, lalu menyusun `perUser` (O(user×pinjaman)) dan `perBook`
 * (O(buku×pinjaman)). Untuk satu layar itu pemborosan yang tumbuh terus.
 *
 * Hasil angkanya HARUS identik dengan `getDashboard()` — diuji di
 * tests/beranda.test.ts.
 */
export async function getRingkasanBeranda(userId: string) {
  const perUser = await prisma.readingProgress.groupBy({
    by: ["userId"],
    where: { status: "SELESAI" },
    _count: true,
  });

  // Nama dibutuhkan karena `getDashboard()` memecah seri dengan nama
  // (`finishedCount` sama → urut nama). Tanpa ini urutan 5 besar bisa beda.
  const nama = await prisma.user.findMany({ select: { id: true, name: true, phone: true } });
  const namaMap = new Map(nama.map((u) => [u.id, u.name.trim() || displayPhone(u.phone)]));

  const urut = perUser
    .map((r) => ({ userId: r.userId, finishedCount: r._count, name: namaMap.get(r.userId) ?? "?" }))
    .sort((a, b) => b.finishedCount - a.finishedCount || a.name.localeCompare(b.name));

  // Peringkat kompetisi standar: nilai sama → peringkat sama (1,1,3 — bukan 1,2,3).
  let peringkat = 1;
  for (let i = 0; i < urut.length; i++) {
    if (i > 0 && urut[i].finishedCount !== urut[i - 1].finishedCount) peringkat = i + 1;
    (urut[i] as { rank?: number }).rank = peringkat;
  }

  const aku = urut.find((r) => r.userId === userId);

  return {
    finishedBooks: aku?.finishedCount ?? 0,
    myRank: aku ? ((aku as { rank?: number }).rank ?? null) : null,
    top: urut.slice(0, 5).map((t) => ({
      userId: t.userId,
      name: t.name,
      finishedCount: t.finishedCount,
      rank: (t as { rank?: number }).rank ?? 0,
    })),
  };
}

/**
 * Progres bacaan yang masih berjalan untuk satu orang — dipakai halaman
 * Riwayat supaya bisa langsung "lanjut dari halaman X" termasuk untuk buku
 * yang sudah dikembalikan.
 */
export async function unfinishedFor(userId: string) {
  const rows = await prisma.readingProgress.findMany({
    where: { userId, status: "SEDANG_DIBACA" },
    include: { book: { select: { id: true, title: true, author: true, pages: true, category: true, coverUrl: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => ({ ...toProgressView(r), book: r.book, updatedAt: r.updatedAt }));
}
