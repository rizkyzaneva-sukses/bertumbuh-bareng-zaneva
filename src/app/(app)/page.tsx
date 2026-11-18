import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { effectiveStatus, MAX_ACTIVE_LOANS } from "@/lib/loans";
import { keyFromDbDate } from "@/lib/dates";
import { getDashboard } from "@/lib/stats";
import { DueText, StatusChip } from "@/components/ui";
import { ReturnLoanButton } from "@/components/LoanActions";

export default async function Beranda() {
  const user = await requireUser();
  const [loans, dash] = await Promise.all([
    prisma.loan.findMany({ where: { userId: user.id }, include: { book: true }, orderBy: { borrowedAt: "desc" } }),
    getDashboard(),
  ]);
  const active = loans.filter((l) => !l.returnedAt);
  const done = loans.filter((l) => l.returnedAt);
  const finishedBooks = new Set(done.map((l) => l.bookId)).size;
  const me = dash.ranking.find((r) => r.userId === user.id);
  return (
    <>
      <h1>Halo, {user.name.split(" ")[0]} 👋</h1>
      <p className="muted">Yuk bertumbuh bareng. Satu halaman sehari juga jalan.</p>

      <div className="grid cols2" style={{ marginBottom: 14 }}>
        <div className="stat"><b data-testid="slot-used">{active.length}/{MAX_ACTIVE_LOANS}</b><span>Slot pinjam terpakai</span></div>
        <div className="stat"><b data-testid="my-finished">{finishedBooks}</b><span>Buku selesai kamu baca{me ? ` · peringkat #${me.rank}` : ""}</span></div>
      </div>

      <h2>Pinjaman saya</h2>
      {active.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>Belum ada buku yang dipinjam. <Link href="/buku">Cari buku di rak →</Link></p>
        </div>
      ) : (
        active.map((l) => {
          const st = effectiveStatus(l);
          return (
            <div className="card" key={l.id} data-testid="my-loan">
              <div className="row between">
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{l.book.title}</h3>
                  <div className="small muted">{l.book.author}</div>
                  <DueText dueKey={keyFromDbDate(l.dueDate)} />
                </div>
                <StatusChip status={st} />
              </div>
              <div style={{ marginTop: 10 }}><ReturnLoanButton loanId={l.id} title={l.book.title} /></div>
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
          <h2 style={{ marginTop: 18 }}>Riwayat bacaku</h2>
          <div className="card">
            <ul className="list">
              {done.slice(0, 10).map((l) => (
                <li key={l.id}><b>{l.book.title}</b> <span className="small muted">· {l.book.author}</span></li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
