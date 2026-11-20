import { jakartaKey, keyFromDbDate } from "./dates";
import type { LoanStatus } from "../generated/prisma/client";

/**
 * Aturan status pinjaman — dipisah dari `loans.ts` supaya modul yang cuma butuh
 * "berapa slot" / "telat atau tidak" tidak menarik seluruh logika peminjaman
 * (dan tidak membentuk import melingkar dengan modul progres bacaan).
 */

export const MAX_ACTIVE_LOANS = 2;

/** Status efektif: yang masih dipinjam dan lewat jatuh tempo dianggap terlambat. */
export function effectiveStatus(
  loan: { status: LoanStatus; dueDate: Date; returnedAt: Date | null },
  now = new Date(),
): LoanStatus {
  if (loan.returnedAt || loan.status === "DIKEMBALIKAN") return "DIKEMBALIKAN";
  return jakartaKey(now) > keyFromDbDate(loan.dueDate) ? "TERLAMBAT" : "DIPINJAM";
}
