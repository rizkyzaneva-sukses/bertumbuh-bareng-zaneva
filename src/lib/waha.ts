import { chatId } from "./phone";

export type SendText = (phone: string, text: string) => Promise<void>;

/** Kirim teks lewat WAHA: POST {WAHA_URL}/api/sendText, header X-Api-Key. */
export const wahaSendText: SendText = async (phone, text) => {
  const base = (process.env.WAHA_URL ?? "").replace(/\/+$/, "");
  if (!base) throw new Error("WAHA_URL belum diisi");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.WAHA_API_KEY) headers["X-Api-Key"] = process.env.WAHA_API_KEY;
  const res = await fetch(`${base}/api/sendText`, {
    method: "POST",
    headers,
    body: JSON.stringify({ session: process.env.WAHA_SESSION || "default", chatId: chatId(phone), text }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WAHA ${res.status}: ${body.slice(0, 200)}`);
  }
};
