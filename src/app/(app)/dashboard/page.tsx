import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDashboard } from "@/lib/stats";
import { formatTanggalPendek } from "@/lib/dates";
import { Stat, StatusChip } from "@/components/ui";

export const metadata = { title: "Dashboard" };

const TABS = [
  { key: "ranking", label: "🏆 Ranking" },
  { key: "orang", label: "👤 Per orang" },
  { key: "buku", label: "📖 Per buku" },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { tab: t } = await searchParams;
  const tab = TABS.some((x) => x.key === t) ? t! : "ranking";
  const d = await getDashboard();
  return (
    <>
      <h1>Dashboard 📊</h1>
      <div className="grid cols2 cols4" style={{ marginBottom: 14 }}>
        <Stat n={d.totals.books} label="Judul buku" />
        <Stat n={d.totals.reading} label="Sedang dibaca" />
        <Stat n={d.totals.finished} label="Selesai dibaca" />
        <Stat n={d.totals.late} label="Terlambat" />
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <Link key={x.key} href={`/dashboard?tab=${x.key}`} className={tab === x.key ? "on" : ""} role="tab" aria-selected={tab === x.key}>{x.label}</Link>
        ))}
      </div>

      {tab === "ranking" && (
        <div className="card" data-testid="ranking">
          <h2>Pembaca teratas</h2>
          <p className="muted small">Diurutkan dari jumlah buku berbeda yang sudah selesai dibaca (sudah dikembalikan).</p>
          {d.ranking.length === 0 ? (
            <p className="muted">Belum ada yang selesai baca.</p>
          ) : (
            <ul className="list">
              {d.ranking.map((r) => (
                <li key={r.userId} className="row" data-testid="rank-row">
                  <span className={`rank r${r.rank}`}>{r.rank}</span>
                  <span style={{ flex: 1 }}>{r.name}{r.userId === user.id ? " (kamu)" : ""}</span>
                  <span className="chip accent">{r.finishedCount} buku</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "orang" &&
        d.perUser.map((u) => (
          <details key={u.userId} data-testid="person">
            <summary>
              <span>{u.name}{u.userId === user.id ? " (kamu)" : ""}</span>
              <span className="chip green">{u.finishedCount} selesai</span>
              {u.reading.length > 0 && <span className="chip amber">{u.reading.length} dibaca</span>}
            </summary>
            <div className="inner">
              <h3>Sedang dibaca</h3>
              {u.reading.length === 0 ? <p className="muted small">Tidak ada.</p> : (
                <ul className="list">
                  {u.reading.map((b) => (
                    <li key={b.loanId}><b>{b.title}</b> <StatusChip status={b.status} /> <span className="small muted">tempo {formatTanggalPendek(b.dueKey)}</span></li>
                  ))}
                </ul>
              )}
              <h3>Sudah dibaca</h3>
              {u.finished.length === 0 ? <p className="muted small">Belum ada.</p> : (
                <ul className="list">{u.finished.map((b) => <li key={b.id}>{b.title} <span className="small muted">· {b.author}</span></li>)}</ul>
              )}
            </div>
          </details>
        ))}

      {tab === "buku" &&
        d.perBook.map((b) => (
          <details key={b.id} data-testid="book-stat">
            <summary>
              <span>{b.title}</span>
              <span className="chip green">{b.readers.length} pembaca</span>
              {b.readingNow.length > 0 && <span className="chip amber">{b.readingNow.length} dibaca</span>}
            </summary>
            <div className="inner">
              <div className="small muted">{b.author} · tersedia {b.available}/{b.stock}</div>
              <h3 style={{ marginTop: 8 }}>Sedang dibaca</h3>
              {b.readingNow.length === 0 ? <p className="muted small">Tidak ada.</p> : (
                <ul className="list">{b.readingNow.map((r) => <li key={r.userId}>{r.name} <StatusChip status={r.status} /></li>)}</ul>
              )}
              <h3>Sudah baca</h3>
              {b.readers.length === 0 ? <p className="muted small">Belum ada.</p> : <p>{b.readers.map((r) => r.name).join(", ")}</p>}
            </div>
          </details>
        ))}
    </>
  );
}
