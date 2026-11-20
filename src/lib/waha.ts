import { chatId } from "./phone";

export type SendText = (phone: string, text: string) => Promise<void>;

function base() {
  return (process.env.WAHA_URL ?? "").replace(/\/+$/, "");
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.WAHA_API_KEY) h["X-Api-Key"] = process.env.WAHA_API_KEY;
  return h;
}

/** Kirim teks lewat WAHA: POST {WAHA_URL}/api/sendText, header X-Api-Key. */
export const wahaSendText: SendText = async (phone, text) => {
  const b = base();
  if (!b) throw new Error("WAHA_URL belum diisi");
  const res = await fetch(`${b}/api/sendText`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ session: process.env.WAHA_SESSION || "default", chatId: chatId(phone), text }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WAHA ${res.status}: ${body.slice(0, 200)}`);
  }
};

export type IncomingMessage = {
  id: string;
  timestamp: number;
  fromMe: boolean;
  body: string;
  chatId: string;
};

/**
 * Ambil pesan dari SATU chat sejak `sinceMs` (epoch detik).
 *
 * Sengaja membaca per-chat, bukan menyapu semua chat: pertanyaan "beres baca"
 * hanya butuh balasan dari nomor yang kita tanyai, dan menyapu seluruh sesi
 * akan mencampur ribuan pesan grup operasional Zaneva.
 *
 * Kalau WAHA membalas non-200, kembalikan array kosong alih-alih melempar —
 * polling akan dicoba lagi pada siklus berikutnya.
 */
export async function wahaFetchMessages(phone: string, sinceMs: number, limit = 50): Promise<IncomingMessage[]> {
  const b = base();
  if (!b) throw new Error("WAHA_URL belum diisi");
  const url =
    `${b}/api/${encodeURIComponent(process.env.WAHA_SESSION || "default")}` +
    `/chats/${encodeURIComponent(chatId(phone))}/messages` +
    `?limit=${limit}&downloadMedia=false&filter%5Btimestamp%5D%5Bgte%5D=${Math.floor(sinceMs / 1000)}`;
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(20000) });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as unknown;
  if (!Array.isArray(data)) return [];
  return data
    .map((m) => m as Record<string, unknown>)
    .filter((m) => typeof m.body === "string" && typeof m.timestamp === "number")
    .map((m) => ({
      id: String(m.id ?? ""),
      timestamp: Number(m.timestamp),
      fromMe: Boolean(m.fromMe),
      body: String(m.body),
      chatId: chatId(phone),
    }));
}
