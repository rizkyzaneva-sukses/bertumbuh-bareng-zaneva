import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { displayPhone } from "@/lib/phone";
import { myHistory, daysFromToday } from "@/lib/reading";
import { formatTanggalPendek } from "@/lib/dates";
import { DueText, StatusChip } from "@/components/ui";
import { ReturnLoanButton } from "@/components/LoanActions";
import { ReadingControls, RenewButton, ProgressBar } from "@/components/ReadingControls";

export const metadata = { title: "Riwayat Baca" };
export const dynamic = "force-dynamic";

/**
 * Filter Riwayat Baca.
 *
 * Bos: "kalo di Riwayat Baca itu ada tombol filternya". Tujuannya menyembunyikan
 * tumpukan buku yang sudah kembali ke rak — yang dicari sehari-hari hanya
 * "sedang kupinjam" dan "belum tuntas".
 */
const FILTERS = [
  { key: "semua", label: "Semua" },
  { key: "dipinjam", label: "📚 Sedang kupinjam" },
  { key: "belum", label: "⏳ Belum tuntas" },
  { key: "selesai", label: "✅ Selesai" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default async function RiwayatPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const user = await requireUser();
  const { f: raw } = await searchParams;
  const f: FilterKey = (FILTERS.some((x) => x.key === raw) ? raw : "semua") as FilterKey;
  const h = await myHistory(user.id);

  // Buku di tangan, dipisah menurut progresnya.
  const dipinjam = h.reading;
  const dipinjamBelum = dipinjam.filter((b) => b.progress && b.progress.status !== "SELESAI");
  // Buku yang SUDAH kembali ke rak tapi belum tuntas — inilah "lanjutkan bacaan".
  // Sengaja TIDAK memakai daftar progres mentah, supaya buku yang sedang dipegang
  // tidak muncul dua kali (dulu muncul di "Lanjutkan bacaan" DAN "Sedang kupinjam").
  const lanjut = h.returned.filter((b) => b.progress && b.progress.status === "SEDANG_DIBACA");
  const kembaliSelesai = h.returned.filter((b) => b.progress?.status === "SELESAI");
  const kembaliKosong = h.returned.filter((b) => !b.progress);
  const selesaiSemua = [
    ...dipinjam.filter((b) => b.progress?.status === "SELESAI").map((b) => ({ id: b.bookId, title: b.title, author: b.author, lastPage: b.progress!.lastPage, total: b.pages, percent: b.progress!.percent, where: "Sedang dipinjam" as const })),
    ...kembaliSelesai.map((b) => ({ id: b.bookId, title: b.title, author: b.author, lastPage: b.progress!.lastPage, total: b.pages, percent: b.progress!.percent, where: "Sudah dikembalikan" as const })),
  ];

  const show = (k: FilterKey) => f === "semua" || f === k;
  // Semantik filter (dibuat eksplisit supaya tidak tumpang tindih):
  //   semua   -> lanjut + dipinjam + selesai + collapse "sudah dikembalikan"
  //   dipinjam -> hanya buku yang masih di tangan
  //   belum    -> buku belum tuntas, baik yang masih dipegang maupun sudah kembali
  //   selesai  -> hanya yang sudah ditandai beres baca
  const tampilLanjut = show("belum") && lanjut.length > 0;
  const tampilDipinjam = show("dipinjam") || f === "belum";
  const dipinjamTampil = f === "belum" ? dipinjamBelum : dipinjam;
  const tampilSelesai = show("selesai");
  const tampilCollapse = f === "semua" && h.returned.length > 0;

  return (
    <>
      <h1>Riwayat Baca 📖</h1>
      <p className="muted small">
        Progres bacaan menempel ke bukumu, bukan ke peminjaman — jadi kalau kepotong lalu pindah buku lain, kamu bisa
        lanjut lagi dari halaman terakhir kapan pun.
      </p>

      <div className="tabs" role="tablist">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "semua" ? "/riwayat" : `/riwayat?f=${x.key}`}
            className={f === x.key ? "on" : ""}
            role="tab"
            aria-selected={f === x.key}
            data-testid={`filter-${x.key}`}
          >
            {x.label}
          </Link>
        ))}
      </div>

      {/* ── Belum tuntas: buku sudah kembali tapi bacaan belum kelar ── */}
      {tampilLanjut && (
        <>
          <h2 style={{ marginTop: 4 }}>Lanjutkan bacaan ⏳</h2>
          <p className="muted small" style={{ marginTop: -6 }}>
            Buku ini sudah kembali ke rak, tapi belum kamu tandai beres. Catat halamannya di sini kapan saja.
          </p>
          {lanjut.map((b) => (
            <div className="card" key={b.bookId} data-testid="continue-card">
              <div className="row between">
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{b.title}</h3>
                  <div className="small muted">{b.author}</div>
                  <div className="small">
                    Halaman <b>{b.progress!.lastPage}</b>
                    {b.pages ? <> dari {b.pages}</> : null} · {b.progress!.percent}%
                  </div>
                </div>
                <span className="chip amber">Belum tuntas</span>
              </div>
              <ProgressBar percent={b.progress!.percent} />
              <ReadingControls
                bookId={b.bookId}
                title={b.title}
                totalPages={b.pages}
                lastPage={b.progress!.lastPage}
                finished={false}
                compact
              />
            </div>
          ))}
        </>
      )}

      {/* ── Sedang kupinjam ── */}
      {tampilDipinjam && (
        <>
          <h2 style={{ marginTop: 18 }}>Sedang kupinjam ({dipinjam.length}/{h.slots})</h2>
          {dipinjamTampil.length === 0 ? (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>
                {f === "belum" ? (
                  "Semua buku di tanganmu sudah tuntas. "
                ) : (
                  <>Belum ada buku di tangan. <Link href="/buku">Cari di rak →</Link> </>
                )}
              </p>
            </div>
          ) : (
            dipinjamTampil.map((b) => {
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
        </>
      )}

      {/* ── Selesai (semua buku yang sudah ditandai beres) ── */}
      {tampilSelesai && (
        <>
          <h2 style={{ marginTop: 18 }}>✅ Selesai dibaca ({selesaiSemua.length})</h2>
          {selesaiSemua.length === 0 ? (
            <div className="card">
              <p className="muted" style={{ margin: 0 }}>Belum ada buku yang ditandai beres.</p>
            </div>
          ) : (
            selesaiSemua.map((b) => (
              <div className="card" key={b.id} data-testid="finished-card">
                <div className="row between">
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0 }}>{b.title}</h3>
                    <div className="small muted">
                      {b.author} · halaman {b.lastPage}
                      {b.total ? ` dari ${b.total}` : ""} · {b.where.toLowerCase()}
                    </div>
                  </div>
                  <span className="chip green">✓ Selesai</span>
                </div>
                <ProgressBar percent={100} />
              </div>
            ))
          )}
        </>
      )}

      {/* ── Sudah dikembalikan: DEFAULT TERTUTUP ──
          Bos: "status buku yang sudah dikembalikan itu hide aja, kalo butuh liat
          tinggal tampilkan defaultnya hide". Yang belum tuntas sudah naik ke
          "Lanjutkan bacaan", jadi isi collapse ini hanya yang selesai/kosong. */}
      {tampilCollapse && (
        <details data-testid="returned-collapse" style={{ marginTop: 18 }}>
          <summary>
            <span>📦 Sudah dikembalikan</span>
            <span className="chip">{h.returned.length} buku</span>
          </summary>
          <div className="inner">
            {kembaliSelesai.length > 0 && (
              <>
                <h3 style={{ marginTop: 4 }}>Selesai dibaca</h3>
                <ul className="list">
                  {kembaliSelesai.map((b) => (
                    <li key={b.bookId}>
                      {b.title}
                      <span className="small muted">
                        {" "}· {b.author}
                        {b.lastReturnedAt ? ` · kembali ${formatTanggalPendek(b.lastReturnedAt.toISOString().slice(0, 10))}` : ""}
                        {b.times > 1 ? ` · dipinjam ${b.times}×` : ""}
                      </span>{" "}
                      <span className="chip green">✓</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {kembaliKosong.length > 0 && (
              <>
                <h3>Tanpa catatan halaman</h3>
                <p className="muted small" style={{ marginTop: -4 }}>
                  Belum pernah kamu catat progresnya. Kalau ternyata sudah dibaca, tandai beres di sini.
                </p>
                {kembaliKosong.map((b) => (
                  <div className="card" key={b.bookId} style={{ marginBottom: 8 }}>
                    <div className="row between">
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: 0, fontSize: "1rem" }}>{b.title}</h3>
                        <div className="small muted">
                          {b.author}
                          {b.lastReturnedAt ? ` · kembali ${formatTanggalPendek(b.lastReturnedAt.toISOString().slice(0, 10))}` : ""}
                          {b.times > 1 ? ` · dipinjam ${b.times}×` : ""}
                        </div>
                      </div>
                    </div>
                    <ReadingControls
                      bookId={b.bookId}
                      title={b.title}
                      totalPages={b.pages}
                      lastPage={0}
                      finished={false}
                      compact
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        </details>
      )}

      <p className="small muted" style={{ marginTop: 16 }}>
        Login sebagai {user.name || displayPhone(user.phone)} · <Link href="/profil">Profil</Link>
      </p>
    </>
  );
}
