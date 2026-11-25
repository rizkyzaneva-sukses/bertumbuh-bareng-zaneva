import { prisma } from "@/lib/db";
import { effectiveStatus } from "@/lib/loan-status";
import { formatDateTimeWib, formatTanggalPendek, keyFromDbDate } from "@/lib/dates";
import { displayPhone } from "@/lib/phone";
import { CONDITION_LABEL, isCondition } from "@/lib/conditions";
import { toProgressView } from "@/lib/reading";
import { promptStats } from "@/lib/wa-prompts";
import { StatusChip, ConditionChip } from "@/components/ui";
import { ReturnLoanButton } from "@/components/LoanActions";
import { ProgressBar } from "@/components/ReadingControls";
import { ProofAdmin } from "@/components/ProofAdmin";

export const metadata = { title: "Admin · Pinjaman" };
export const dynamic = "force-dynamic";

export default async function AdminPinjaman() {
  const [active, recent, progresses, prompts] = await Promise.all([
    prisma.loan.findMany({ where: { returnedAt: null }, include: { user: true, book: true }, orderBy: { dueDate: "asc" } }),
    prisma.loan.findMany({ where: { returnedAt: { not: null } }, include: { user: true, book: true }, orderBy: { returnedAt: "desc" }, take: 20 }),
    prisma.readingProgress.findMany(),
    promptStats(),
  ]);
  // Bukti foto untuk daftar pengembalian terbaru — supaya admin bisa memeriksa
  // kondisi buku tanpa harus bertanya ke peminjam.
  const bukti = new Map(
    (
      await prisma.returnProof.findMany({
        where: { loanId: { in: recent.map((l) => l.id) } },
        select: { loanId: true, sizeBytes: true, createdAt: true },
      })
    ).map((r) => [r.loanId, r]),
  );
  const via = { LINK: "lewat link WA", USER: "oleh peminjam", ADMIN: "oleh admin" } as const;
  const bermasalah = recent.filter((l) => l.condition && l.condition !== "BAIK");

  const progOf = (userId: string, bookId: string) => {
    const p = progresses.find((x) => x.userId === userId && x.bookId === bookId);
    return p ? toProgressView(p) : null;
  };
  const nameOf = (name: string, phone: string) => name.trim() || displayPhone(phone);

  return (
    <>
      <h2>Sedang dipinjam ({active.length})</h2>
      {active.length === 0 && <div className="card muted">Tidak ada pinjaman aktif.</div>}
      {active.map((l) => {
        const p = progOf(l.userId, l.bookId);
        return (
          <div className="card" key={l.id} data-testid="admin-loan">
            <div className="row between">
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0 }}>{l.book.title}</h3>
                <div className="small">{nameOf(l.user.name, l.user.phone)} · <span className="muted">{displayPhone(l.user.phone)}</span></div>
                <div className="small muted">
                  Dipinjam {formatDateTimeWib(l.borrowedAt)} · tempo {formatTanggalPendek(keyFromDbDate(l.dueDate))}
                  {l.renewCount > 0 ? ` · diperpanjang ${l.renewCount}×` : ""}
                </div>
              </div>
              <StatusChip status={effectiveStatus(l)} />
            </div>
            <div className="small" style={{ marginTop: 8 }}>
              {p ? (
                <>
                  Progres: <b>{p.lastPage}</b>{l.book.pages ? <>/{l.book.pages}</> : null} ({p.percent}%)
                  {p.status === "SELESAI" && <> · <span className="chip green">✓ Beres baca</span></>}
                </>
              ) : (
                <span className="muted">Belum ada progres dicatat</span>
              )}
            </div>
            {p && <ProgressBar percent={p.percent} />}
            <div style={{ marginTop: 10 }}><ReturnLoanButton loanId={l.id} title={l.book.title} admin /></div>
          </div>
        );
      })}

      <div className="card" data-testid="prompt-stats">
        <h3 style={{ marginTop: 0 }}>Pertanyaan &ldquo;beres bacanya?&rdquo;</h3>
        <p className="small muted" style={{ marginTop: -4 }}>
          Dikirim otomatis lewat WhatsApp begitu buku dikembalikan. Anggota balas <code>1</code> atau{" "}
          <code>2 (halaman)</code>.
        </p>
        <ul className="list">
          <li>Menunggu balasan: <b>{prompts.waiting}</b></li>
          <li>Balas <code>1</code> (beres): <b>{prompts.answeredFinish}</b></li>
          <li>Balas <code>2</code> (belum selesai): <b>{prompts.answeredUnfinished}</b></li>
        </ul>
      </div>

      <h2 style={{ marginTop: 20 }}>Baru dikembalikan</h2>
      {bermasalah.length > 0 && (
        <p className="muted small">Ada {bermasalah.length} buku kembali dalam kondisi rusak/hilang — stok sudah disesuaikan otomatis.</p>
      )}
      <div className="card">
        {recent.length === 0 ? <span className="muted">Belum ada.</span> : (
          <ul className="list">
            {recent.map((l) => {
              const p = progOf(l.userId, l.bookId);
              return (
                <li key={l.id} data-testid="returned-loan">
                  <b>{l.book.title}</b> · {nameOf(l.user.name, l.user.phone)}
                  {isCondition(l.condition) && l.condition !== "BAIK" && <> <ConditionChip condition={l.condition} /></>}
                  {p?.status === "SELESAI" ? (
                    <> <span className="chip green">✓ Beres</span></>
                  ) : (
                    <> <span className="chip amber">Belum beres</span></>
                  )}
                  <div className="small muted">
                    Kembali {formatDateTimeWib(l.returnedAt!)} {l.returnedVia ? via[l.returnedVia] : ""}
                    {isCondition(l.condition) ? ` · kondisi ${CONDITION_LABEL[l.condition]}` : ""}
                    {p && p.lastPage > 0 ? ` · sampai hlm ${p.lastPage}${l.book.pages ? `/${l.book.pages}` : ""}` : ""}
                  </div>
                  {l.conditionNote && <div className="small" style={{ fontStyle: "italic" }}>“{l.conditionNote}”</div>}
                  <div style={{ marginTop: 6 }}>
                    <ProofAdmin
                      loanId={l.id}
                      adaBukti={bukti.has(l.id)}
                      ukuran={bukti.get(l.id)?.sizeBytes ?? null}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
