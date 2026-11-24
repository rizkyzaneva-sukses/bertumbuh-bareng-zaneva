import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MAX_ACTIVE_LOANS } from "@/lib/loans";
import { displayPhone } from "@/lib/phone";
import { BookCover } from "@/components/BookCover";
import { BorrowButton } from "@/components/LoanActions";
import { ProgressBar } from "@/components/ReadingControls";
import { formatTanggal, keyFromDbDate } from "@/lib/dates";
import { getLoanWorkingDays } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Detail buku.
 *
 * Sebelumnya kartu di rak cuma <article> tanpa tautan — Bos mengeluh
 * *"app ini saya ga bisa klik untuk lihat detail bukunya ya?"*. Halaman ini
 * menjawab itu: sinopsis lengkap, siapa yang sedang memegang, progres baca
 * sendiri, dan tombol pinjam.
 */
export default async function DetailBukuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const book = await prisma.book.findUnique({ where: { id } });
  if (!book) notFound();

  const [active, myLoans, myProgress, lamaPinjam] = await Promise.all([
    prisma.loan.findMany({
      where: { bookId: id, returnedAt: null },
      select: { dueDate: true, user: { select: { name: true, phone: true } } },
      orderBy: { borrowedAt: "asc" },
    }),
    prisma.loan.findMany({
      where: { userId: user.id, returnedAt: null },
      select: { bookId: true },
    }),
    prisma.readingProgress.findUnique({
      where: { userId_bookId: { userId: user.id, bookId: id } },
      select: { lastPage: true, totalPages: true, status: true, finishedAt: true },
    }),
    getLoanWorkingDays(),
  ]);

  const taken = active.length;
  const available = Math.max(0, book.stock - taken);
  const mine = myLoans.some((l) => l.bookId === id);
  const slotsFull = myLoans.length >= MAX_ACTIVE_LOANS;
  const holders = [...new Set(active.map((l) => l.user.name.trim() || displayPhone(l.user.phone)))];
  // Jatuh tempo terdekat — informasi paling berguna kalau bukunya sedang dipinjam.
  const dueTerdekat = active.length ? keyFromDbDate(active[0].dueDate) : null;

  const totalPages = myProgress?.totalPages ?? book.pages ?? null;
  const finished = myProgress?.status === "SELESAI";
  const percent = totalPages && myProgress ? Math.round((Math.min(myProgress.lastPage, totalPages) / totalPages) * 100) : null;

  return (
    <>
      <p style={{ marginTop: 0 }}>
        <Link href="/buku" className="muted" style={{ textDecoration: "none" }}>
          ← Rak Buku
        </Link>
      </p>

      <div className="detail-head">
        <div className="detail-cover">
          <BookCover book={book} size="lg" />
        </div>
        <div className="detail-meta">
          <h1 style={{ marginBottom: 4 }}>{book.title}</h1>
          <p className="muted" style={{ margin: "0 0 8px" }}>
            {book.author}
            {book.pages ? ` · ${book.pages} hlm` : ""}
          </p>
          <div className="row" style={{ marginBottom: 10 }}>
            {book.category ? <span className="chip accent">{book.category}</span> : null}
            {mine ? (
              <span className="chip amber">Kamu pinjam</span>
            ) : available > 0 ? (
              <span className="chip green">Tersedia {available}/{book.stock}</span>
            ) : (
              <span className="chip red">Semua dipinjam</span>
            )}
          </div>

          <BorrowButton
            bookId={book.id}
            title={book.title}
            lamaHari={lamaPinjam}
            disabled={mine || available < 1 || slotsFull}
            label={mine ? "Sedang dipinjam" : available < 1 ? "Habis" : "Pinjam buku ini"}
          />
          {slotsFull && !mine ? (
            <p className="muted" style={{ fontSize: ".82rem", margin: "6px 0 0" }}>
              Slot pinjammu penuh (maks {MAX_ACTIVE_LOANS}). Balikin dulu satu buku.
            </p>
          ) : null}
        </div>
      </div>

      {mine && dueTerdekat ? (
        <div className="card" style={{ marginTop: 14 }}>
          <b>Sedang kamu pinjam</b>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Jatuh tempo {formatTanggal(dueTerdekat)}. Bisa diperpanjang dari menu Riwayat.
          </p>
        </div>
      ) : null}

      {!mine && holders.length > 0 ? (
        <div className="card" style={{ marginTop: 14 }}>
          <b>Sedang dipegang</b>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {holders.join(", ")}
            {dueTerdekat ? ` · kembali ${formatTanggal(dueTerdekat)}` : ""}
          </p>
        </div>
      ) : null}

      {myProgress && totalPages ? (
        <div className="card" style={{ marginTop: 14 }}>
          <b>{finished ? "Sudah selesai dibaca" : "Progres bacamu"}</b>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Halaman {myProgress.lastPage} dari {totalPages} ({percent}%)
          </p>
          <ProgressBar percent={percent ?? 0} />
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 14 }}>
        <b>Sinopsis</b>
        <p style={{ margin: "6px 0 0", lineHeight: 1.65 }}>
          {book.synopsis?.trim() || <span className="muted">Belum ada sinopsis untuk buku ini.</span>}
        </p>
      </div>

      <p className="muted" style={{ fontSize: ".78rem", marginTop: 14 }}>
        Pinjam {lamaPinjam} hari kerja (Ahad tidak dihitung) · stok {book.stock} eksemplar
      </p>
    </>
  );
}
