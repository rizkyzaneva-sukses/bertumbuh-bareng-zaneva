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

/**
 * Tanggal mulai dihitungnya tempo pinjaman (tanggal kalender WIB), disimpan di
 * tabel `Setting` dengan kunci `SETTING_LOAN_COUNT_FROM`.
 *
 * Bos: *"Kan jadi 7 hari Broo semua dimulai dari hari besok aja dihitungan hari
 * pertama Jumat. Karena baru launch jumat"*
 *
 * Perpustakaan diresmikan Jumat 27 Nov 2026. Pinjaman yang terjadi SEBELUM tanggal
 * itu (persiapan, buku dibagikan lebih awal) tetap dihitung mulai Jumat: hari ke-1
 * = Jumat 27 Nov, jadi 7 hari kerja berakhir Jumat 4 Des 2026.
 *
 * Kenapa disimpan sebagai Setting, bukan konstanta: begitu tanggal ini lewat ia
 * tidak berpengaruh lagi (tanggal pinjam selalu lebih besar), jadi aman ditinggal.
 * Tapi bila Bos menunda/memajukanlaunch, cukup ubah satu nilai di DB — tanpa deploy.
 * Tidak ada baris = tidak ada jangkar (aturan biasa).
 */
export const SETTING_LOAN_COUNT_FROM = "loan_count_from";

/** Nilai jangkar yang dipakai saat launch (diisi oleh seed/migrasi data). */
export const LOAN_COUNT_FROM_SEED = "2026-11-27";

/** Bulatkan & jepit nilai apa pun jadi jumlah hari yang sah. */
export function clampLoanDays(value: unknown): number {
  // null / undefined / string kosong BUKAN angka 0 — Number(null) === 0, dan 0
  // akan terjepit jadi 1 hari. Nilai tidak ada = pakai default.
  if (value === null || value === undefined || value === "") return LOAN_WORKING_DAYS_DEFAULT;
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return LOAN_WORKING_DAYS_DEFAULT;
  return Math.min(LOAN_DAYS_MAX, Math.max(LOAN_DAYS_MIN, n));
}
