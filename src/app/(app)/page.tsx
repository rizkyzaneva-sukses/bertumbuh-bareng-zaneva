import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MAX_ACTIVE_LOANS, effectiveStatus } from "@/lib/loan-status";
import { keyFromDbDate } from "@/lib/dates";
import { getDashboard, unfinishedFor } from "@/lib/stats";
import { progressMap } from "@/lib/reading";
import { DueText, StatusChip } from "@/components/ui";
import { ReturnLoanButton } from "@/components/LoanActions";
import { ReadingControls, RenewButton, ProgressBar } from "@/components/ReadingControls";
import { BookCover } from "@/components/BookCover";

export default async function Beranda() {
  const user = await requireUser();
  const [loans, dash, prog, lanjut] = await Promise.all([
    prisma.loan.findMany({ where: { userId: user.id }, include: { book: true }, orderBy: { borrowedAt: "desc" } }),
    getDashboard(),
    progressMap(user.id),
    unfinishedFor(user.id),
  ]);
  const active = loans.filter((l) => !l.returnedAt);
  const done = loans.filter((l) => l.returnedAt);
  const finishedBooks = dash.perUser.find((u) => u.userId === user.id)?.finishedCount ?? 0;
  const me = dash.ranking.find((r) => r.userId === user.id);
  return (
    <>
      <h1>Halo, {user.name.trim().split(" ")[0] || "Sahabat"} 👋</h1>
      <p className="muted">Yuk bertumbuh bareng. Satu halaman sehari juga jalan.</p>

      <div className="grid cols2" style={{ marginBottom: 14 }}>
        <div className="stat"><b data-testid="slot-used">{active.length}/{MAX_ACTIVE_LOANS}</b><span>Slot pinjam terpakai</span></div>
        <div className="stat"><b data-testid="my-finished">{finishedBooks}</b><span>Buku selesai kamu baca{me ? ` · peringkat #${me.rank}` : ""}</span></div>
      </div>

      {lanjut.length > 0 && (
        <div className="hero" data-testid="continue-banner">
          <BookCover
            book={{ id: lanjut[0].book.id, title: lanjut[0].book.title, author: lanjut[0].book.author, category: lanjut[0].book.category, coverUrl: lanjut[0].book.coverUrl }}
            size="sm"
          />
          <div className="hero-body">
            <b>Lanjutkan bacaanmu 📖</b>
            <div className="small muted">
              {lanjut[0].book.title} — halaman {lanjut[0].lastPage}
              {lanjut[0].totalPages ? `/${lanjut[0].totalPages}` : ""} ({lanjut[0].percent}%)
              {lanjut.length > 1 ? ` · +${lanjut.length - 1} lainnya` : ""}
            </div>
            <ProgressBar percent={lanjut[0].percent} />
          </div>
          <Link className="btn sm soft" href="/riwayat">Lanjut</Link>
        </div>
      )}

      <h2>Pinjaman saya</h2>
      {active.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>Belum ada buku yang dipinjam. <Link href="/buku">Cari buku di rak →</Link></p>
        </div>
      ) : (
        active.map((l) => {
          const st = effectiveStatus(l);
          const p = prog.get(l.bookId) ?? null;
          return (
            <div className="card" key={l.id} data-testid="my-loan">
              <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 12 }}>
                <div style={{ width: 52, flex: "none" }}>
                  <BookCover book={l.book} size="xs" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 style={{ margin: 0 }}>{l.book.title}</h3>
                  <div className="small muted">{l.book.author}</div>
                  <DueText dueKey={keyFromDbDate(l.dueDate)} />
                </div>
                <StatusChip status={st} />
              </div>

              {p ? (
                <>
                  <div className="small" style={{ marginTop: 8 }}>
                    Halaman <b>{p.lastPage}</b>{l.book.pages ? <> dari {l.book.pages}</> : null} · {p.percent}%
                  </div>
                  <ProgressBar percent={p.percent} />
                </>
              ) : null}

              <ReadingControls
                bookId={l.bookId}
                title={l.book.title}
                totalPages={l.book.pages}
                lastPage={p?.lastPage ?? 0}
                finished={p?.status === "SELESAI"}
              />

              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <RenewButton loanId={l.id} dueLabel={keyFromDbDate(l.dueDate)} renewLeft={Math.max(0, 2 - l.renewCount)} />
                <ReturnLoanButton loanId={l.id} title={l.book.title} />
              </div>
            </div>
          );
        })
      )}

      <div className="row between" style={{ marginTop: 18 }}>
        <h2 style={{ margin: 0 }}>Pembaca teratas 🏆</h2>
        <Link href="/dashboard" className="small">Lihat semua</Link>
      </div>
      <div className="card" style={{ marginTop: 8 }}>
        {dash.ranking.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Belum ada yang selesai baca. Jadi yang pertama!</p>
        ) : (
          <ul className="list">
            {dash.ranking.slice(0, 5).map((r) => (
              <li key={r.userId} className="row">
                <span className={`rank r${r.rank}`}>{r.rank}</span>
                <span style={{ flex: 1 }}>{r.name}{r.userId === user.id ? " (kamu)" : ""}</span>
                <span className="chip accent">{r.finishedCount} buku</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {done.length > 0 && (
        <>
          <div className="row between" style={{ marginTop: 18 }}>
            <h2 style={{ margin: 0 }}>Riwayat bacaku</h2>
            <Link href="/riwayat" className="small">Semua</Link>
          </div>
          {/* Default TERTUTUP — yang penting di beranda adalah buku di tangan. */}
          <details data-testid="home-returned-collapse">
            <summary>
              <span>📦 Sudah dikembalikan</span>
              <span className="chip">{done.length} buku</span>
            </summary>
            <div className="inner">
              <ul className="list">
                {done.slice(0, 30).map((l) => {
                  const p = prog.get(l.bookId);
                  return (
                    <li key={l.id}>
                      <b>{l.book.title}</b> <span className="small muted">· {l.book.author}</span>
                      {p?.status === "SELESAI" ? (
                        <> <span className="chip green">✓ Selesai</span></>
                      ) : (
                        <span className="small muted"> · belum ditandai beres</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
        </>
      )}
    </>
  );
}
