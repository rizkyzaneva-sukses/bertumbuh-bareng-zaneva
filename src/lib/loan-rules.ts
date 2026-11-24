/**
 * Aturan lama pinjam — bagian MURNI (tanpa Prisma).
 *
 * Kenapa dipisah: komponen client (`LoanDaysForm`) butuh `LOAN_DAYS_MIN/MAX`
 * untuk atribut input. Kalau konstanta itu diambil dari `settings.ts`, file itu
 * ikut menarik `prisma` → `pg` ke bundel browser dan `next build` gagal dengan
 * "Module not found: Can't resolve 'fs'" / trace `pg/lib/utils.js`.
 *
 * Jadi: angka & rumus di sini, akses database di `settings.ts`.
 */

/** Lama pinjam default (hari kerja). */
export const LOAN_WORKING_DAYS_DEFAULT = 7;

/** Kunci di tabel Setting. */
export const SETTING_LOAN_DAYS = "loan_working_days";

/** Batas wajar: 1 hari (uji coba) sampai 30 hari (sebulan). */
export const LOAN_DAYS_MIN = 1;
export const LOAN_DAYS_MAX = 30;

/** Bulatkan & jepit nilai apa pun jadi jumlah hari yang sah. */
export function clampLoanDays(value: unknown): number {
  // null / undefined / string kosong BUKAN angka 0 — Number(null) === 0, dan 0
  // akan terjepit jadi 1 hari. Nilai tidak ada = pakai default.
  if (value === null || value === undefined || value === "") return LOAN_WORKING_DAYS_DEFAULT;
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return LOAN_WORKING_DAYS_DEFAULT;
  return Math.min(LOAN_DAYS_MAX, Math.max(LOAN_DAYS_MIN, n));
}
