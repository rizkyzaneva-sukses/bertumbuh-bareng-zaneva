import bcrypt from "bcryptjs";

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const verifyPassword = (p: string, hash: string) => bcrypt.compare(p, hash);

export function defaultPassword(): string {
  const p = process.env.DEFAULT_PASSWORD;
  if (!p || p.length < 6) throw new Error("DEFAULT_PASSWORD belum diisi (minimal 6 karakter)");
  return p;
}
