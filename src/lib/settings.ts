import { prisma } from "./db";
import {
  clampLoanDays,
  LOAN_WORKING_DAYS_DEFAULT,
  SETTING_LOAN_COUNT_FROM,
  SETTING_LOAN_DAYS,
} from "./loan-rules";

/**
 * Akses database untuk aturan lama pinjam.
 *
 * Bos: *"Untuk waktunya bisa jadi buat flexibel di menu profile ga? Saya mau
 * settingan default jadi 7 hari, jadi takutnya nanti ada kebijakan berubah.
 * Buku boleh dibawa kerumah soalnya."*
 *
 * Lama pinjam disimpan di tabel `Setting`, bukan angka di kode, supaya admin
 * bisa mengubahnya sendiri dari Profil tanpa deploy ulang.
 *
 * PENTING: file ini menyentuh Prisma, jadi JANGAN diimpor komponen client.
 * Konstanta murni ada di `loan-rules.ts`.
 */

export { LOAN_WORKING_DAYS_DEFAULT, LOAN_DAYS_MIN, LOAN_DAYS_MAX, SETTING_LOAN_DAYS, SETTING_LOAN_COUNT_FROM, LOAN_COUNT_FROM_SEED, clampLoanDays } from "./loan-rules";

/**
 * Lama pinjam yang berlaku sekarang.
 *
 * Gagal baca Setting TIDAK boleh menggagalkan peminjaman — kalau tabel belum
 * ada / DB sedang sibuk, pakai default 7 hari.
 */
export async function getLoanWorkingDays(): Promise<number> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: SETTING_LOAN_DAYS } });
    if (!row) return LOAN_WORKING_DAYS_DEFAULT;
    return clampLoanDays(row.value);
  } catch (e) {
    console.error("[setting] gagal baca lama pinjam, pakai default:", String((e as Error).message ?? e));
    return LOAN_WORKING_DAYS_DEFAULT;
  }
}

/** Simpan lama pinjam baru. Mengembalikan nilai yang benar-benar tersimpan. */
export async function setLoanWorkingDays(days: number): Promise<number> {
  const value = clampLoanDays(days);
  await prisma.setting.upsert({
    where: { key: SETTING_LOAN_DAYS },
    create: { key: SETTING_LOAN_DAYS, value: String(value) },
    update: { value: String(value) },
  });
  return value;
}

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tanggal launch (jangkar hitung tempo), atau null bila tidak diatur.
 *
 * Dibaca terpisah dari `getLoanWorkingDays()` karena sifatnya beda: lama pinjam
 * adalah kebijakan yang sering diubah, sedangkan tanggal launch adalah fakta sekali
 * seumur app. Gagal baca = null (aturan biasa) supaya peminjaman tidak pernah gagal
 * gara-gara Setting.
 */
export async function getLoanCountFrom(): Promise<string | null> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: SETTING_LOAN_COUNT_FROM } });
    const v = row?.value?.trim();
    // Tolak nilai rusak: tanggal ngawur akan menggeser tempo semua orang.
    if (!v || !KEY_RE.test(v) || Number.isNaN(Date.parse(v + "T00:00:00Z"))) return null;
    return v;
  } catch (e) {
    console.error("[setting] gagal baca tanggal launch, pakai aturan biasa:", String((e as Error).message ?? e));
    return null;
  }
}

/** Atur / hapus tanggal launch. `null` = kembali ke aturan biasa. */
export async function setLoanCountFrom(key: string | null): Promise<string | null> {
  const v = key?.trim() || null;
  if (!v) {
    await prisma.setting.deleteMany({ where: { key: SETTING_LOAN_COUNT_FROM } });
    return null;
  }
  if (!KEY_RE.test(v) || Number.isNaN(Date.parse(v + "T00:00:00Z")))
    throw new Error(`tanggal launch tidak sah: ${v}`);
  await prisma.setting.upsert({
    where: { key: SETTING_LOAN_COUNT_FROM },
    create: { key: SETTING_LOAN_COUNT_FROM, value: v },
    update: { value: v },
  });
  return v;
}
