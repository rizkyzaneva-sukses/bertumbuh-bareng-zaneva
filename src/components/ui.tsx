import type { LoanStatus } from "@/generated/prisma/client";
import { formatTanggalPendek } from "@/lib/dates";

export function StatusChip({ status }: { status: LoanStatus }) {
  if (status === "DIKEMBALIKAN") return <span className="chip green">Dikembalikan</span>;
  if (status === "TERLAMBAT") return <span className="chip red">Terlambat</span>;
  return <span className="chip amber">Dipinjam</span>;
}

export function DueText({ dueKey }: { dueKey: string }) {
  return <span className="small muted">Jatuh tempo {formatTanggalPendek(dueKey)}</span>;
}

export function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="stat">
      <b>{n}</b>
      <span>{label}</span>
    </div>
  );
}
