import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./loans";
import { getCurrentUser, type CurrentUser } from "./auth";
import { needsProfile } from "./profile";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400, code = "ERROR") => json({ ok: false, code, error: message }, status);

/** Tolak request tulis dari origin lain (perlindungan CSRF tambahan di atas SameSite=Lax). */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser / same-origin GET-ish
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

type Opts = { admin?: boolean; auth?: boolean; allowMustChange?: boolean };
type Ctx<P> = { params: Promise<P> };

/** Pembungkus route handler: cek origin, login, admin, "profil belum lengkap", dan error umum. */
export function handler<P = Record<string, string>>(
  opts: Opts,
  fn: (req: NextRequest, ctx: { user: CurrentUser; params: P }) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      if (req.method !== "GET" && !sameOrigin(req)) return fail("Origin tidak diizinkan", 403, "ORIGIN");
      const user = opts.auth === false ? null : await getCurrentUser();
      if (opts.auth !== false) {
        if (!user) return fail("Silakan login dulu", 401, "UNAUTHENTICATED");
        if (needsProfile(user) && !opts.allowMustChange)
          return fail("Lengkapi nama dan ganti password dulu sebelum lanjut", 403, "MUST_CHANGE_PASSWORD");
        if (opts.admin && user.role !== "ADMIN") return fail("Khusus admin", 403, "FORBIDDEN");
      }
      return await fn(req, { user: user as CurrentUser, params: await ctx.params });
    } catch (e) {
      if (e instanceof AppError) return fail(e.message, e.status, e.code);
      if (e instanceof ZodError) return fail(e.issues[0]?.message ?? "Data tidak valid", 400, "VALIDATION");
      console.error(e);
      return fail("Terjadi kesalahan di server", 500, "SERVER");
    }
  };
}
