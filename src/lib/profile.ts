/**
 * Aturan "profil belum lengkap".
 *
 * Akun baru dibuat admin tanpa nama (biar orangnya sendiri yang mengisi) dan
 * dengan password sementara. Keduanya harus diselesaikan sebelum bisa memakai app.
 */
export type Profilable = { name?: string | null; mustChangePassword?: boolean };

/** True kalau masih wajib melengkapi nama atau mengganti password sementara. */
export function needsProfile(u: Profilable): boolean {
  return Boolean(u.mustChangePassword) || !normName(u.name ?? "").length;
}

/** Rapikan nama: buang spasi berlebih, batasi 80 karakter. */
export function normName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 80);
}

export const NAME_MIN = 2;

/** Nama yang boleh disimpan. Mengembalikan alasan kalau tidak valid. */
export function checkName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  const name = normName(raw ?? "");
  if (name.length < NAME_MIN) return { ok: false, reason: `Nama minimal ${NAME_MIN} karakter` };
  if (!/[a-zA-Z\u00C0-\u024F\u0600-\u06FF]/.test(name)) return { ok: false, reason: "Nama harus mengandung huruf" };
  return { ok: true, name };
}
