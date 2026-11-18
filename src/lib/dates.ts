// Semua logika tanggal memakai tanggal kalender WIB (Asia/Jakarta, UTC+7, tanpa DST).
// Tanggal direpresentasikan sebagai string kunci "YYYY-MM-DD".

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export const LOAN_WORKING_DAYS = 3;

const HARI = ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function shifted(d: Date) {
  return new Date(d.getTime() + WIB_OFFSET_MS);
}

/** Tanggal kalender WIB dari sebuah instant. */
export function jakartaKey(d: Date): string {
  return shifted(d).toISOString().slice(0, 10);
}

export function jakartaHour(d: Date): number {
  return shifted(d).getUTCHours();
}

/** 0 = Ahad ... 6 = Sabtu */
export function dayOfWeek(key: string): number {
  return new Date(key + "T00:00:00Z").getUTCDay();
}

export function addDays(key: string, n: number): string {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(fromKey: string, toKey: string): number {
  return Math.round(
    (new Date(toKey + "T00:00:00Z").getTime() - new Date(fromKey + "T00:00:00Z").getTime()) / 86400000,
  );
}

/**
 * Jatuh tempo = tanggal peminjaman + `workingDays` hari kerja.
 * Hari Ahad TIDAK dihitung (Sabtu dihitung). Hari peminjaman sendiri tidak dihitung.
 * Contoh: Senin -> Kamis, Kamis -> Senin, Jumat -> Selasa, Sabtu -> Rabu, Ahad -> Rabu.
 */
export function computeDueDate(borrowKey: string, workingDays = LOAN_WORKING_DAYS): string {
  let key = borrowKey;
  let counted = 0;
  while (counted < workingDays) {
    key = addDays(key, 1);
    if (dayOfWeek(key) !== 0) counted++;
  }
  return key;
}

export function dateFromKey(key: string): Date {
  return new Date(key + "T00:00:00Z");
}

/** Date dari kolom @db.Date -> kunci. */
export function keyFromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatTanggal(key: string, withDay = true): string {
  const d = new Date(key + "T00:00:00Z");
  const base = `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withDay ? `${HARI[d.getUTCDay()]}, ${base}` : base;
}

export function formatTanggalPendek(key: string): string {
  const d = new Date(key + "T00:00:00Z");
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
}

export function formatDateTimeWib(d: Date): string {
  const s = shifted(d);
  const hh = String(s.getUTCHours()).padStart(2, "0");
  const mm = String(s.getUTCMinutes()).padStart(2, "0");
  return `${formatTanggalPendek(s.toISOString().slice(0, 10))} ${hh}.${mm} WIB`;
}
