import { prisma } from "@/lib/db";
import { effectiveStatus } from "@/lib/loans";
import { formatDateTimeWib, formatTanggalPendek, keyFromDbDate } from "@/lib/dates";
import { displayPhone } from "@/lib/phone";
import { CONDITION_LABEL, isCondition } from "@/lib/conditions";
import { StatusChip, ConditionChip } from "@/components/ui";
import { ReturnLoanButton } from "@/components/LoanActions";

export const metadata = { title: "Admin · Pinjaman" };
export default async function AdminPinjaman() {
  const [active, recent] = await Promise.all([
    prisma.loan.findMany({ where: { returnedAt: null }, include: { user: true, book: true }, orderBy: { dueDate: "asc" } }),
    prisma.loan.findMany({ where: { returnedAt: { not: null } }, include: { user: true, book: true }, orderBy: { returnedAt: "desc" }, take: 20 }),
  ]);
  const via = { LINK: "lewat link WA", USER: "oleh peminjam", ADMIN: "oleh admin" } as const;
  const bermasalah = recent.filter((l) => l.condition && l.condition !== "BAIK");
  return (
    <>
      <h2>Sedang dipinjam ({active.length})</h2>
      {active.length === 0 && <div className="card muted">Tidak ada pinjaman aktif.</div>}
      {active.map((l) => (
        <div className="card" key={l.id} data-testid="admin-loan">
          <div className="row between">
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0 }}>{l.book.title}</h3>
              <div className="small">{l.user.name || displayPhone(l.user.phone)} · <span className="muted">{displayPhone(l.user.phone)}</span></div>
              <div className="small muted">Dipinjam {formatDateTimeWib(l.borrowedAt)} · tempo {formatTanggalPendek(keyFromDbDate(l.dueDate))}</div>
            </div>
            <StatusChip status={effectiveStatus(l)} />
          </div>
          <div style={{ marginTop: 10 }}><ReturnLoanButton loanId={l.id} title={l.book.title} admin /></div>
        </div>
      ))}

      <h2 style={{ marginTop: 20 }}>Baru dikembalikan</h2>
      {bermasalah.length > 0 && (
        <p className="muted small">Ada {bermasalah.length} buku kembali dalam kondisi rusak/hilang — stok sudah disesuaikan otomatis.</p>
      )}
      <div className="card">
        {recent.length === 0 ? <span className="muted">Belum ada.</span> : (
          <ul className="list">
            {recent.map((l) => (
              <li key={l.id} data-testid="returned-loan">
                <b>{l.book.title}</b> · {l.user.name || displayPhone(l.user.phone)}
                {isCondition(l.condition) && l.condition !== "BAIK" && <> <ConditionChip condition={l.condition} /></>}
                <div className="small muted">
                  Kembali {formatDateTimeWib(l.returnedAt!)} {l.returnedVia ? via[l.returnedVia] : ""}
                  {isCondition(l.condition) ? ` · kondisi ${CONDITION_LABEL[l.condition]}` : ""}
                </div>
                {l.conditionNote && <div className="small" style={{ fontStyle: "italic" }}>“{l.conditionNote}”</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
