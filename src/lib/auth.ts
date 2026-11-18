import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";

export type SessionData = { userId?: string };

export function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) throw new Error("SESSION_SECRET harus diisi minimal 32 karakter");
  return {
    password,
    cookieName: "bbz_session",
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: (process.env.APP_URL ?? "").startsWith("https://"),
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export async function getCurrentUser() {
  const s = await getSession();
  if (!s.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: s.userId } });
  if (!user) {
    try {
      s.destroy();
    } catch {
      /* di server component cookie tidak bisa diubah; abaikan */
    }
    return null;
  }
  return user;
}
export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Untuk halaman (server component). */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}
export async function requireAdminPage(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role !== "ADMIN") redirect("/");
  return u;
}
