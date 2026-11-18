import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET harus diisi minimal 32 karakter");
  return s;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString();

function sign(payload: string) {
  return createHmac("sha256", secret()).update("return-link:" + payload).digest("base64url");
}

export function newNonce() {
  return randomBytes(16).toString("base64url");
}

/** Token link pengembalian: base64url(loanId.nonce.exp).signature */
export function makeReturnToken(loanId: string, nonce: string, expiresAtMs: number): string {
  const payload = b64(`${loanId}.${nonce}.${expiresAtMs}`);
  return `${payload}.${sign(payload)}`;
}

export type ReturnTokenData = { loanId: string; nonce: string; exp: number };

export function verifyReturnToken(token: string, nowMs = Date.now()): ReturnTokenData | null {
  const [payload, sig, extra] = (token ?? "").split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [loanId, nonce, expStr] = unb64(payload).split(".");
  const exp = Number(expStr);
  if (!loanId || !nonce || !Number.isFinite(exp) || exp < nowMs) return null;
  return { loanId, nonce, exp };
}

export function returnUrl(token: string): string {
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/kembali/${token}`;
}
