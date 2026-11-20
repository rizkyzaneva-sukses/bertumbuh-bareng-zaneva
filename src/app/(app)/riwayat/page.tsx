import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { displayPhone } from "@/lib/phone";
import { myHistory, daysFromToday } from "@/lib/reading";
import { unfinishedFor } from "@/lib/stats";
import { formatTanggalPendek } from "@/lib/dates";
import { DueText, StatusChip } from "@/components/ui";
import { ReturnLoanButton } from "@/components/LoanActions";
import { ReadingControls, RenewButton, ProgressBar } from "@/components/ReadingControls";

export const metadata = { title: "Riwayat Baca" };
export const dynamic = "force-dynamic";

export default async function RiwayatPage() {
  const user = await requireUser();
  const [h, lanjut] = await Promise.all([myHistory(user.id), unfinishedFor(user.id)]);

  return (
    <>
      <h1>Riwayat Baca 📖</h1>
      <p className="muted small">
        Progres bacaan menempel ke bukumu, bukan ke peminjaman — jadi kalau kepotong lalu pindah buku lain, kamu bisa
        lanjut lagi dari halaman terakhir kapan pun.
      </p>

      {/* Yang paling dicari: buku yang belum tuntas, termasuk yang sudah dikembalikan. */}
      {lanjut.length > 0 && (
        <>
          <h2 style={{ marginTop: 4 }}>Lanjutkan bacaan</h2>
          {lanjut.map((b) => (
            <div className="card" key={b.bookId} data-testid="continue-card">
              <div className="row between">
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{b.book.title}</h3>
                  <div className="small muted">{b.book.author}</div>
                  <div className="small">
                    Halaman <b>{b.lastPage}</b>
                    {b.totalPages ? <> dari {b.totalPages}</> : null} · {b.percent}%
                    <span className="muted"> · terakhir dibaca {formatTanggalPendek(b.updatedAt.toISOString().slice(0, 10))}</span>
                  </div>
                </div>
                <span className="chip amber">Belum tuntas</span>
              </div>
              <ProgressBar percent={b.percent} />
              <ReadingControls
                bookId={b.bookId}
                title={b.book.title}
                totalPages={b.totalPages}
                lastPage={b.lastPage}
                finished={false}
                compact
              />
            </div>
          ))}
        </>
      )}

      <h2 style={{ marginTop: 18 }}>Sedang kupinjam ({h.reading.length}/{h.slots})</h2>
      {h.reading.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Belum ada buku di tangan. <Link href="/buku">Cari di rak →</Link>
          </p>
        </div>
      ) : (
        h.reading.map((b) => {
          const sisa = daysFromToday(b.dueKey);
          return (
            <div className="card" key={b.loanId} data-testid="loan-card">
              <div className="row between">
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{b.title}</h3>
                  <div className="small muted">{b.author}</div>
                  <div className="row" style={{ gap: 8 }}>
                    <DueText dueKey={b.dueKey} />
                    {sisa >= 0 ? (
                      <span className="small muted">· {sisa === 0 ? "hari ini" : `${sisa} hari lagi`}</span>
                    ) : (
                      <span className="small" style={{ color: "var(--red)" }}>· lewat {-sisa} hari</span>
                    )}
                  </div>
                </div>
                <StatusChip status={b.status} />
              </div>

              {b.progress ? (
                <>
                  <div className="small" style={{ marginTop: 8 }}>
                    Halaman <b>{b.progress.lastPage}</b>
                    {b.pages ? <> dari {b.pages}</> : null} · {b.progress.percent}%
                    {b.progress.status === "SELESAI" && <> · <span className="chip green">✓ Selesai</span></>}
                  </div>
                  <ProgressBar percent={b.progress.percent} />
                </>
              ) : null}

              <ReadingControls
                bookId={b.bookId}
                title={b.title}
                totalPages={b.pages}
                lastPage={b.progress?.lastPage ?? 0}
                finished={b.progress?.status === "SELESAI"}
              />

              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <RenewButton loanId={b.loanId} dueLabel={formatTanggalPendek(b.dueKey)} renewLeft={b.renewLeft} />
                <ReturnLoanButton loanId={b.loanId} title={b.title} />
              </div>
            </div>
          );
        })
      )}

      <h2 style={{ marginTop: 18 }}>Sudah dikembalikan</h2>
      <p className="muted small" style={{ marginTop: -6 }}>
        Buku yang kembali ke rak belum tentu selesai dibaca. Kalau masih ingin lanjut, catat halamannya di sini — atau
        tekan <b>Beres baca</b> kalau sudah tuntas.
      </p>
      {h.returned.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>Belum ada riwayat.</p>
        </div>
      ) : (
        h.returned.map((b) => (
          <div className="card" key={b.bookId} data-testid="returned-card">
            <div className="row between">
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0 }}>{b.title}</h3>
                <div className="small muted">
                  {b.author}
                  {b.times > 1 ? ` · dipinjam ${b.times}×` : ""}
                  {b.lastReturnedAt ? ` · kembali ${formatTanggalPendek(b.lastReturnedAt.toISOString().slice(0, 10))}` : ""}
                </div>
              </div>
              {b.progress?.status === "SELESAI" ? (
                <span className="chip green">✓ Selesai</span>
              ) : (
                <span className="chip amber">Belum tuntas</span>
              )}
            </div>
            {b.progress && b.progress.lastPage > 0 && b.progress.status !== "SELESAI" && (
              <>
                <div className="small" style={{ marginTop: 8 }}>
                  Terakhir di halaman <b>{b.progress.lastPage}</b>
                  {b.pages ? <> dari {b.pages}</> : null} · {b.progress.percent}%
                </div>
                <ProgressBar percent={b.progress.percent} />
              </>
            )}
            <ReadingControls
              bookId={b.bookId}
              title={b.title}
              totalPages={b.pages}
              lastPage={b.progress?.lastPage ?? 0}
              finished={b.progress?.status === "SELESAI"}
              compact
            />
          </div>
        ))
      )}

      <p className="small muted" style={{ marginTop: 16 }}>
        Login sebagai {user.name || displayPhone(user.phone)} · <Link href="/profil">Profil</Link>
      </p>
    </>
  );
}
