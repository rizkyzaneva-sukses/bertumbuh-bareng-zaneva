/**
 * Kondisi fisik buku saat dikembalikan.
 *
 * Dipakai untuk mencatat buku rusak/hilang — sebelumnya `returnLoan` cuma mengisi
 * `returnedAt`, jadi buku hilang tetap dihitung tersedia dan lenyap tanpa jejak.
 */
export type Condition = "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT" | "HILANG";

export const CONDITIONS: Condition[] = ["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"];

export const CONDITION_LABEL: Record<Condition, string> = {
  BAIK: "Baik",
  RUSAK_RINGAN: "Rusak ringan",
  RUSAK_BERAT: "Rusak berat",
  HILANG: "Hilang",
};

/** Penjelasan singkat untuk dropdown admin. */
export const CONDITION_HINT: Record<Condition, string> = {
  BAIK: "Kembali normal, masih bisa dipinjam",
  RUSAK_RINGAN: "Masih bisa dibaca, mis. lecet / lipatan",
  RUSAK_BERAT: "Tidak layak dipinjam lagi, mis. sobek parah / basah",
  HILANG: "Tidak kembali, stok otomatis dikurangi",
};

const CHIP: Record<Condition, string> = {
  BAIK: "green",
  RUSAK_RINGAN: "amber",
  RUSAK_BERAT: "red",
  HILANG: "red",
};

export function conditionChip(c: Condition): string {
  return CHIP[c];
}

/**
 * Berapa eksemplar yang harus dikurangi dari stok karena kondisi ini.
 * Hanya HILANG yang mengurangi stok — rusak berat tetap milik perpustakaan
 * (bisa diperbaiki), tapi ditandai supaya tidak dipinjam lagi.
 */
export function stockLoss(c: Condition): number {
  return c === "HILANG" ? 1 : 0;
}

/** Kondisi yang membuat buku tidak boleh dipinjam lagi. */
export function isUnusable(c: Condition): boolean {
  return c === "RUSAK_BERAT" || c === "HILANG";
}

export function isCondition(v: unknown): v is Condition {
  return typeof v === "string" && (CONDITIONS as string[]).includes(v);
}
