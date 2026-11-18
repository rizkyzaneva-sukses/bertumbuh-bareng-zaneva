/**
 * Normalisasi nomor HP Indonesia ke format 62xxxxxxxxxx (tanpa +).
 * Menerima: 0812..., 62812..., +62812..., 812..., "0812-2021-0193", "+62 812 2021 0193".
 * Mengembalikan null kalau tidak valid.
 */
export function normalizePhone(input: string): string | null {
  let d = (input ?? "").replace(/[^\d+]/g, "");
  d = d.replace(/\+/g, "");
  if (!d) return null;
  if (d.startsWith("0062")) d = d.slice(2);
  if (d.startsWith("620")) d = "62" + d.slice(3);
  else if (d.startsWith("62")) {
    // sudah benar
  } else if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  else return null;
  if (!/^628\d{7,12}$/.test(d)) return null;
  return d;
}

/** 6281220210193 -> 081220210193 */
export function displayPhone(p: string): string {
  return p.startsWith("62") ? "0" + p.slice(2) : p;
}

export function chatId(p: string): string {
  return `${p}@c.us`;
}
