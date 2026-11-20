import { z } from "zod";
import { handler, json } from "@/lib/http";
import { markFinished, saveProgress, toProgressView } from "@/lib/reading";

const Body = z.object({
  bookId: z.string().min(1),
  /** Halaman terakhir yang dibaca. */
  lastPage: z.number().int().min(0).optional(),
  /** true = tandai beres, false = batalkan tanda beres. */
  done: z.boolean().optional(),
});

/**
 * Catat progres bacaan.
 *
 * Dipakai dua alur yang Bos sebut:
 * 1. "saya baca Buku A sampai 200, kepotong, lanjut lagi nanti" → `lastPage`.
 * 2. "baca di kantor, buka histori pinjaman, klik beres" → `done: true`.
 *
 * Tidak mensyaratkan buku sedang dipinjam: buku yang dibaca di tempat tetap
 * boleh dicatat, dan progres tetap tersimpan walau bukunya sudah dikembalikan.
 */
export const POST = handler({}, async (req, { user }) => {
  const { bookId, lastPage, done } = Body.parse(await req.json());

  if (done !== undefined) {
    const p = await markFinished(user.id, bookId, done);
    return json({ ok: true, progress: toProgressView(p) });
  }
  if (lastPage === undefined) return json({ ok: false, error: "Isi lastPage atau done" }, 400);
  const p = await saveProgress(user.id, bookId, lastPage);
  return json({ ok: true, progress: toProgressView(p) });
});
