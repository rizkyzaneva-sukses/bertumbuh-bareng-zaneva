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
        <Stat n={d.totals.reading} label="Sedang dipinjam" />
        <Stat n={d.totals.todayPages} label="Halaman hari ini" />
        <Stat n={d.totals.late} label="Terlambat" />
      </div>
      <p className="muted small" style={{ marginTop: -6 }}>
        <b>Halaman hari ini</b> = jumlah halaman yang dicatat semua karyawan hari ini.{" "}
        {d.totals.finished === 0 && d.totals.totalPages > 0
          ? `Sudah ${d.totals.totalPages} halaman tercatat, tapi belum ada buku yang ditandai tuntas — wajar, buku itu tebal.`
          : d.totals.returnedUnfinished > 0
            ? `${d.totals.returnedUnfinished} buku sudah kembali ke rak tapi belum ditandai beres.`
            : "Semua buku yang kembali sudah ditandai."}
      </p>
      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <Link key={x.key} href={`/dashboard?tab=${x.key}`} className={tab === x.key ? "on" : ""} role="tab" aria-selected={tab === x.key}>{x.label}</Link>
        ))}
      </div>

      {tab === "ranking" && (
        <div className="card" data-testid="ranking">
          <h2>Pembaca teratas</h2>
          <p className="muted small">
            Diurutkan dari jumlah buku yang <b>tuntas</b> dibaca; kalau sama, dari jumlah <b>halaman</b> yang tercatat.
            Yang baru membaca sebagian tetap tampil — bukan dianggap tidak ada.
          </p>
          {d.ranking.length === 0 ? (
            <p className="muted">Belum ada yang mencatat bacaan.</p>
          ) : (
            <ul className="list">
              {d.ranking.map((r) => (
                <li key={r.userId} className="row" data-testid="rank-row">
                  <span className={`rank r${r.rank}`}>{r.rank}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {r.name}{r.userId === user.id ? " (kamu)" : ""}
                    {r.todayPages > 0 && <span className="small muted"> · {r.todayPages} hlm hari ini</span>}
                    {/* Judul buku hari ini. Tanpa ini angka halaman tidak bisa
                        dinilai adil — 97 hlm komik tipis beda dengan 97 hlm
                        buku tebal. Ditumpuk di bawah nama supaya baris tidak
                        melebar keluar layar HP. */}
                    {r.todayBooks.length > 0 && (
                      <span className="rank-books">
                        {r.todayBooks.map((b) => (
                          <span key={b.title} className="rank-book" title={b.title}>
                            📖 {b.title}
                            <span className="muted"> — {b.pages} hlm</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  {r.finishedCount > 0 && <span className="chip green">{r.finishedCount} buku tuntas</span>}
                  <span className={`chip ${r.finishedCount > 0 ? "" : "accent"}`}>{r.totalPagesRead} hlm</span>
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
              {u.finishedCount > 0 && <span className="chip green">{u.finishedCount} tuntas</span>}
              {u.totalPagesRead > 0 && <span className="chip accent">{u.totalPagesRead} hlm</span>}
              {u.todayPages > 0 && <span className="chip amber">{u.todayPages} hlm hari ini</span>}
              {u.reading.length > 0 && <span className="chip">{u.reading.length} dipinjam</span>}
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
              <h3>✅ Sudah selesai dibaca</h3>
              {u.finished.length === 0 ? <p className="muted small">Belum ada.</p> : (
                <ul className="list">{u.finished.map((b) => <li key={b.id}>{b.title} <span className="small muted">· {b.author}</span></li>)}</ul>
              )}
              {/* Buku yang sudah kembali ke rak sengaja DILIPAT: yang dicari
                  di dashboard adalah "sekarang dia sedang baca apa". */}
              {u.returned.length > 0 && (
                <details data-testid="person-returned" style={{ marginTop: 10 }}>
                  <summary>
                    <span>📦 Sudah dikembalikan</span>
                    <span className="chip">{u.returned.length} buku</span>
                  </summary>
                  <div className="inner">
                    <ul className="list">
                      {u.returned.map((b) => (
                        <li key={b.id}>
                          {b.title}
                          <span className="small muted">
                            {" "}· {b.author}
                            {b.lastReturnedAt ? ` · kembali ${formatTanggalPendek(b.lastReturnedAt.toISOString().slice(0, 10))}` : ""}
                            {b.times > 1 ? ` · ${b.times}×` : ""}
                          </span>{" "}
                          {b.finished ? <span className="chip green">✓</span> : <span className="chip amber">belum tuntas</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              )}
            </div>
          </details>
        ))}

      {tab === "buku" &&
        d.perBook.map((b) => (
          <details key={b.id} data-testid="book-stat">
            <summary>
              <span>{b.title}</span>
              {b.readingNow.length > 0 && (
                <span className="chip amber" data-testid="now-reading-count">{b.readingNow.length} dipinjam</span>
              )}
              <span className="chip green">{b.readers.length} selesai</span>
            </summary>
            <div className="inner">
              <div className="small muted">{b.author} · tersedia {b.available}/{b.stock}</div>
              {/* Jawaban langsung untuk "buku A lagi dipinjam siapa?" */}
              <h3 style={{ marginTop: 8 }}>Sedang dipinjam</h3>
              {b.readingNow.length === 0 ? <p className="muted small">Tersedia di rak — belum dipinjam siapa pun.</p> : (
                <ul className="list">
                  {b.readingNow.map((r) => (
                    <li key={r.userId}>
                      <b>{r.name}</b> <StatusChip status={r.status} />
                      <span className="small muted"> · tempo {formatTanggalPendek(r.dueKey)}</span>
                      {r.progress && r.progress.lastPage > 0 && (
                        <span className="small muted"> · hlm {r.progress.lastPage}{b.pagesTotal ? `/${b.pagesTotal}` : ""} ({r.progress.percent}%)</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <h3>Sudah selesai dibaca</h3>
              {b.readers.length === 0 ? <p className="muted small">Belum ada.</p> : <p>{b.readers.map((r) => r.name).join(", ")}</p>}
            </div>
          </details>
        ))}
    </>
  );
}
