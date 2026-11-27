import { prisma } from "./db";
import { effectiveStatus } from "./loan-status";
import { RAK_FILTER } from "./archive";
import { keyFromDbDate, jakartaKey } from "./dates";
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
  const todayKey = jakartaKey(now);
  const [users, books, loans, progresses, logs] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
    prisma.book.findMany({ where: RAK_FILTER, orderBy: { title: "asc" } }),
    prisma.loan.findMany({ include: { book: { select: { id: true, title: true, author: true } } }, orderBy: { borrowedAt: "desc" } }),
    prisma.readingProgress.findMany({
      include: { book: { select: { id: true, title: true, author: true } } },
      orderBy: [{ finishedAt: "desc" }],
    }),
    // Rekap halaman dibaca. Ini yang menjawab "dia sudah baca berapa halaman",
    // terpisah dari "buku mana yang sudah TUNTAS". Sebelumnya dashboard hanya
    // membaca `ReadingProgress.status`, sehingga karyawan yang rajin mencatat
    // halaman (60/320, 25/296) tetap tampil "belum ada yang selesai baca" —
    // padahal catatannya ADA, cuma tidak pernah dibaca dashboard.
    // `book.title` ikut diambil supaya ranking bisa menampilkan buku APA yang
    // dibaca hari ini. Tanpa judul, "97 halaman" tidak bisa dinilai adil:
    // 97 halaman komik tipis beda bobotnya dengan 97 halaman buku tebal.
    prisma.readingLog.findMany({
      select: {
        userId: true,
        bookId: true,
        dayKey: true,
        pagesRead: true,
        book: { select: { title: true } },
      },
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

  // ── Rekap HALAMAN per orang ──────────────────────────────────────────────
  //
  // Dua angka berbeda dan keduanya penting:
  //  • `totalPagesRead` = akumulasi SEMUA halaman yang pernah dicatat (sejak
  //    fitur log harian aktif). Ini "sudah baca berapa banyak".
  //  • `todayPages`     = halaman yang dibaca HARI INI saja.
  //
  // Sengaja dipisah dari `finishedCount` (buku TUNTAS): buku 320 halaman yang
  // baru dibaca 60 halaman BELUM tuntas, tapi tetap kerja keras yang harus
  // terlihat di dashboard — bukan dianggap "tidak ada".
  const pagesByUser = new Map<string, number>();
  const todayByUser = new Map<string, number>();
  // Buku yang dibaca HARI INI per orang, urut halaman terbanyak. Dipakai
  // kolom judul di ranking — angka 97 hlm baru adil kalau kelihatan bukunya.
  const todayBooksByUser = new Map<string, { title: string; pages: number }[]>();
  for (const l of logs) {
    pagesByUser.set(l.userId, (pagesByUser.get(l.userId) ?? 0) + l.pagesRead);
    if (l.dayKey === todayKey) {
      todayByUser.set(l.userId, (todayByUser.get(l.userId) ?? 0) + l.pagesRead);
      const arr = todayBooksByUser.get(l.userId);
      const row = { title: l.book?.title ?? "?", pages: l.pagesRead };
      if (arr) arr.push(row);
      else todayBooksByUser.set(l.userId, [row]);
    }
  }
  for (const arr of todayBooksByUser.values()) arr.sort((a, b) => b.pages - a.pages);

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
      /** total halaman yang pernah dicatat (bukan buku tuntas) */
      totalPagesRead: pagesByUser.get(u.id) ?? 0,
      /** halaman yang dibaca hari ini */
      todayPages: todayByUser.get(u.id) ?? 0,
      /** buku yang dibaca hari ini (judul + halaman), urut terbanyak */
      todayBooks: todayBooksByUser.get(u.id) ?? [],
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

  // Ranking mencakup DUA kelompok, bukan cuma yang tuntas buku:
  //  1. yang sudah menuntaskan buku (prioritas utama — itu prestasi terbesar)
  //  2. yang sudah membaca halaman tapi belum tuntas
  //
  // Sebelumnya filter `finishedCount > 0` membuang semua pembaca aktif, jadi
  // orang yang mencatat 60 halaman tampil sebagai "Belum ada yang selesai
  // baca" — seolah catatannya hilang. Padahal cuma tidak pernah ditampilkan.
  const ranking = perUser
    .filter((u) => u.finishedCount > 0 || u.totalPagesRead > 0)
    .sort(
      (a, b) =>
        b.finishedCount - a.finishedCount ||
        b.totalPagesRead - a.totalPagesRead ||
        a.name.localeCompare(b.name),
    )
    .map((u, i, arr) => {
      // peringkat kompetisi standar: nilai sama -> peringkat sama.
      // Kesamaan diukur dari KEDUA angka, karena dua orang yang sama-sama
      // 0 buku tapi 60 vs 65 halaman bukan seri.
      const sama =
        i > 0 &&
        arr[i - 1].finishedCount === u.finishedCount &&
        arr[i - 1].totalPagesRead === u.totalPagesRead;
      return { ...u, rank: sama ? -1 : i + 1 };
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
      /** total halaman dibaca SEMUA orang hari ini */
      todayPages: logs.filter((l) => l.dayKey === todayKey).reduce((s, l) => s + l.pagesRead, 0),
      /** total halaman dibaca SEMUA orang sejak log harian aktif */
      totalPages: logs.reduce((s, l) => s + l.pagesRead, 0),
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
  const [perUser, pages] = await Promise.all([
    prisma.readingProgress.groupBy({
      by: ["userId"],
      where: { status: "SELESAI" },
      _count: true,
    }),
    // Total halaman tercatat per orang. Wajib ikut, karena ranking dashboard
    // sekarang juga memuat pembaca yang belum menuntaskan buku — kalau Beranda
    // tidak menghitungnya, urutan & isi ranking dua halaman ini berbeda.
    prisma.readingLog.groupBy({ by: ["userId"], _sum: { pagesRead: true } }),
  ]);

  // Nama dibutuhkan karena `getDashboard()` memecah seri dengan nama
  // (`finishedCount` sama → urut nama). Tanpa ini urutan 5 besar bisa beda.
  const nama = await prisma.user.findMany({ select: { id: true, name: true, phone: true } });
  const namaMap = new Map(nama.map((u) => [u.id, u.name.trim() || displayPhone(u.phone)]));

  const selesaiMap = new Map(perUser.map((r) => [r.userId, r._count]));
  const halamanMap = new Map(pages.map((r) => [r.userId, r._sum.pagesRead ?? 0]));

  // Sama seperti dashboard: yang tuntas ATAU yang sudah membaca halaman.
  const urut = [...new Set([...selesaiMap.keys(), ...halamanMap.keys()])]
    .map((id) => ({
      userId: id,
      finishedCount: selesaiMap.get(id) ?? 0,
      totalPagesRead: halamanMap.get(id) ?? 0,
      name: namaMap.get(id) ?? "?",
    }))
    .filter((r) => r.finishedCount > 0 || r.totalPagesRead > 0)
    .sort(
      (a, b) =>
        b.finishedCount - a.finishedCount ||
        b.totalPagesRead - a.totalPagesRead ||
        a.name.localeCompare(b.name),
    );

  // Peringkat kompetisi standar: nilai sama → peringkat sama (1,1,3 — bukan 1,2,3).
  let peringkat = 1;
  for (let i = 0; i < urut.length; i++) {
    const prev = urut[i - 1];
    const sama =
      prev && prev.finishedCount === urut[i].finishedCount && prev.totalPagesRead === urut[i].totalPagesRead;
    if (i > 0 && !sama) peringkat = i + 1;
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
      totalPagesRead: t.totalPagesRead,
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
