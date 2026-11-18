"use client";

export async function api<T = Record<string, unknown>>(
  url: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "POST",
  body?: unknown,
): Promise<{ ok: boolean; error?: string; code?: string } & T> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Terjadi kesalahan", code: data.code, ...data } as never;
    return { ok: true, ...data } as never;
  } catch {
    return { ok: false, error: "Tidak ada koneksi. Coba lagi ya." } as never;
  }
}
