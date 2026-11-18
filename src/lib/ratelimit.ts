// Pembatas percobaan login sederhana di memori (cukup untuk satu instance).
const hits = new Map<string, { n: number; reset: number }>();

export function tooMany(key: string, limit = 8, windowMs = 15 * 60_000): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) return false;
  return h.n >= limit;
}
export function recordFail(key: string, windowMs = 15 * 60_000) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
  else h.n++;
}
export function clearFails(key: string) {
  hits.delete(key);
}
