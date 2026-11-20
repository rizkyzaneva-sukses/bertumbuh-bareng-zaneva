import { prisma } from "./db";
import { markFinished, saveProgress } from "./reading";
import { wahaSendText, wahaFetchMessages, type SendText } from "./waha";
import { displayPhone } from "./phone";
import { jakartaHour } from "./dates";

/** Jam kirim pertanyaan (WIB) — sama dengan jendela pengingat jatuh tempo. */
export const SEND_FROM_HOUR = 8;
export const SEND_UNTIL_HOUR = 20;

/** Pertanyaan kedaluwarsa setelah 7 hari — lewat dari itu tidak dianggap lagi. */
export const PROMPT_TTL_MS = 7 * 86400000;

export type ParsedAnswer = { answer: "1" | "2"; page?: number };

/**
 * Baca balasan WhatsApp.
 *
 * Format yang diterima (sesuai permintaan Bos):
 * - `1`            → beres baca
 * - `2`            → belum selesai (tanpa lapor halaman)
 * - `2 (50)`       → belum selesai, baru sampai halaman 50
 *
 * Variasi yang dimaafkan: `2(50)`, `2 50`, `2 hal 50`, `2 halaman 50`, `2.`,
 * `2️⃣`. Yang WAJIB ditolak: pesan ngobrol biasa dan angka gabungan seperti
 * `12` atau "saya baca 1 buku 2 kali" — kalau longgar, percakapan sehari-hari
 * bisa tak sengaja menandai buku selesai.
 */
export function parseAnswer(raw: string): ParsedAnswer | null {
  // Buang variation selector & keycap supaya emoji angka ikut terbaca.
  const t = (raw ?? "").replace(/[\uFE0F\u20E3]/g, "").trim();
  if (!t) return null;

  // 1 / 1. / 1!
  if (/^1\s*[.!]?$/.test(t)) return { answer: "1" };

  // 2 / 2. — belum selesai tanpa halaman
  if (/^2\s*[.!]?$/.test(t)) return { answer: "2" };

  // 2 (50) · 2(50) · 2 50 · 2 hal 50 · 2 halaman 50
  const m = t.match(/^2\s*[(\[]?\s*(?:(?:hal(?:aman)?|hlm|page|p)\s*)?(\d{1,4})\s*[)\]]?$/i);
  if (m) {
    const page = Number(m[1]);
    if (Number.isFinite(page)) return { answer: "2", page };
  }

  return null;
}

const label = (name: string, phone: string) => name.trim() || (phone ? `kak ${displayPhone(phone)}` : "Sahabat");

/** Teks pertanyaan setelah buku dikembalikan — persis gaya yang diminta Bos. */
export function afterReturnText(name: string, title: string, totalPages?: number | null) {
  return (
    `Halo ${label(name, "")} 👋\n\n` +
    `Buku "${title}" sudah tercatat kembali. Terima kasih!\n\n` +
    `Beres bacanya?\n` +
    `Ketik 1 kalau sudah beres\n` +
    `Ketik 2 dan tuliskan halamannya kalau belum — contoh: 2 (50)` +
    (totalPages ? `\n(buku ini ${totalPages} halaman)` : "") +
    `\n\nKalau belum, progres bacamu tersimpan — nanti tinggal lanjut dari halaman terakhir.`
  );
}

export function ackFinishText(title: string) {
  return `Alhamdulillah 🌱 "${title}" tercatat SELESAI dibaca. Mantap, lanjut buku berikutnya ya!`;
}

export function ackUnfinishedText(title: string, page?: number, totalPages?: number | null) {
  const sampai =
    page !== undefined
      ? `sampai halaman ${page}${totalPages ? ` dari ${totalPages}` : ""}`
      : "belum selesai";
  return (
    `Oke, "${title}" dicatat ${sampai}.\n\n` +
    `Progresmu aman tersimpan dan tidak dihitung selesai di dashboard. ` +
    `Buka app → Riwayat → lanjut dari halaman terakhir kapan pun kamu siap.`
  );
}

/**
 * Catat pertanyaan yang harus dikirim setelah buku dikembalikan.
 *
 * Baris dibuat dengan `sentAt = null` supaya request "balikin buku" tidak ikut
 * menunggu WAHA. Pengiriman dilakukan `deliverPendingPrompts()` yang dipanggil
 * scheduler dan bisa diulang kalau gagal.
 */
export async function queueAfterReturnPrompt(
  userId: string,
  bookId: string,
  loanId: string | null,
  now = new Date(),
) {
  return prisma.waPrompt.create({
    data: {
      userId,
      bookId,
      loanId,
      kind: "AFTER_RETURN",
      expiresAt: new Date(now.getTime() + PROMPT_TTL_MS),
    },
  });
}

export type DeliverResult = { sent: number; failed: number; skipped?: string };

/**
 * Kirim semua pertanyaan yang belum terkirim. Aman diulang (idempoten per baris).
 *
 * Menghormati jendela jam kirim yang SAMA dengan pengingat (08.00–20.00 WIB).
 * Tanpa ini, buku yang dikembalikan tengah malam akan membangunkan orangnya
 * dengan pertanyaan "beres bacanya?" jam 2 pagi.
 */
export async function deliverPendingPrompts(
  opts: { now?: Date; send?: SendText; limit?: number; ignoreWindow?: boolean } = {},
): Promise<DeliverResult> {
  const now = opts.now ?? new Date();
  const send = opts.send ?? wahaSendText;
  if (!opts.ignoreWindow) {
    const h = jakartaHour(now);
    if (h < SEND_FROM_HOUR) return { sent: 0, failed: 0, skipped: "belum jam 08.00 WIB" };
    if (h >= SEND_UNTIL_HOUR) return { sent: 0, failed: 0, skipped: "lewat jendela kirim (>= 20.00 WIB)" };
  }
  const due = await prisma.waPrompt.findMany({
    where: { sentAt: null, answeredAt: null, expiresAt: { gt: now } },
    include: { user: true, book: true },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 20,
  });
  const out: DeliverResult = { sent: 0, failed: 0 };
  for (const p of due) {
    try {
      await send(p.user.phone, afterReturnText(p.user.name, p.book.title, p.book.pages));
      // Klaim baris supaya tidak terkirim dobel kalau dua proses jalan bersamaan.
      await prisma.waPrompt.updateMany({
        where: { id: p.id, sentAt: null },
        data: { sentAt: new Date() },
      });
      out.sent++;
    } catch (e) {
      console.error("[wa-prompt] gagal kirim:", String((e as Error).message ?? e));
      out.failed++;
    }
  }
  return out;
}

export type PollResult = { checked: number; answered: number; replied: number };

/** Kunci Setting untuk penanda pesan terakhir yang sudah diproses per orang. */
const seenKey = (userId: string) => `wa_seen:${userId}`;

/**
 * Baca balasan "1"/"2" dari WhatsApp.
 *
 * Kenapa polling, bukan webhook: sesi WAHA `tehayu` sudah punya webhook ke n8n
 * (`wa-order-extract`). Menambah webhook kedua berarti mengubah konfigurasi
 * sesi yang dipakai alur order gudang — risiko yang tidak perlu. Membaca pesan
 * per-chat lewat REST aman dan tidak menyentuh konfigurasi sesi.
 */
export async function pollPromptReplies(
  opts: { now?: Date; send?: SendText; fetchMessages?: typeof wahaFetchMessages } = {},
): Promise<PollResult> {
  const now = opts.now ?? new Date();
  const send = opts.send ?? wahaSendText;
  const fetchMessages = opts.fetchMessages ?? wahaFetchMessages;

  const pending = await prisma.waPrompt.findMany({
    where: { answeredAt: null, sentAt: { not: null }, expiresAt: { gt: now } },
    include: { user: true, book: true },
    orderBy: { sentAt: "asc" },
  });
  if (pending.length === 0) return { checked: 0, answered: 0, replied: 0 };

  const byUser = new Map<string, typeof pending>();
  for (const p of pending) {
    const list = byUser.get(p.userId) ?? [];
    list.push(p);
    byUser.set(p.userId, list);
  }

  const out: PollResult = { checked: 0, answered: 0, replied: 0 };

  for (const [userId, prompts] of byUser) {
    const user = prompts[0].user;
    out.checked++;

    const seen = await prisma.setting.findUnique({ where: { key: seenKey(userId) } });
    const seenTs = seen ? Number(seen.value) || 0 : 0;
    // Batas bawah: yang lebih baru antara pertanyaan pertama & pesan terakhir
    // yang sudah diproses. Dikurangi 120 detik untuk toleransi jam WAHA.
    const oldestSent = Math.min(...prompts.map((p) => (p.sentAt as Date).getTime()));
    const sinceMs = Math.max(oldestSent, seenTs ? seenTs + 1000 : 0) - 120000;

    let messages;
    try {
      messages = await fetchMessages(user.phone, sinceMs);
    } catch (e) {
      console.error("[wa-prompt] gagal baca pesan:", String((e as Error).message ?? e));
      continue;
    }

    // Hanya pesan masuk (bukan yang kita kirim), urut lama -> baru.
    const incoming = messages
      .filter((m) => !m.fromMe && m.timestamp * 1000 > seenTs)
      .sort((a, b) => a.timestamp - b.timestamp);

    let newestSeen = seenTs;
    for (const msg of incoming) {
      newestSeen = Math.max(newestSeen, msg.timestamp * 1000);
      const parsed = parseAnswer(msg.body);
      if (!parsed) continue;

      // Terapkan ke pertanyaan tertua yang masih terbuka — konfirmasi ke
      // anggota menyebut judulnya, jadi tidak ada tebak-tebakan.
      const target = prompts.find((p) => !p.answeredAt);
      if (!target) break;

      const claimed = await prisma.waPrompt.updateMany({
        where: { id: target.id, answeredAt: null },
        data: { answeredAt: new Date(), answer: parsed.answer, replyText: msg.body.slice(0, 200) },
      });
      if (claimed.count === 0) continue;
      target.answeredAt = new Date();

      if (parsed.answer === "1") {
        await markFinished(userId, target.bookId, true, now);
      } else if (parsed.page !== undefined) {
        // "2 (50)" → belum beres DAN simpan halaman 50 sekaligus, dalam satu
        // balasan WA. Ini yang membuat dashboard jujur: tidak masuk "selesai",
        // tapi progresnya tidak hilang.
        await saveProgress(userId, target.bookId, parsed.page, now);
      } else {
        // "2" polos → tetap tandai belum selesai tanpa mengubah halaman.
        await markFinished(userId, target.bookId, false, now);
      }
      out.answered++;

      try {
        await send(
          user.phone,
          parsed.answer === "1"
            ? ackFinishText(target.book.title)
            : ackUnfinishedText(target.book.title, parsed.page, target.book.pages),
        );
        out.replied++;
      } catch (e) {
        console.error("[wa-prompt] gagal kirim konfirmasi:", String((e as Error).message ?? e));
      }
    }

    if (newestSeen > seenTs) {
      await prisma.setting.upsert({
        where: { key: seenKey(userId) },
        create: { key: seenKey(userId), value: String(newestSeen) },
        update: { value: String(newestSeen) },
      });
    }
  }

  return out;
}

/** Berapa pertanyaan yang masih menggantung — untuk panel admin. */
export async function promptStats() {
  const [waiting, answeredFinish, answeredUnfinished] = await Promise.all([
    prisma.waPrompt.count({ where: { answeredAt: null } }),
    prisma.waPrompt.count({ where: { answer: "1" } }),
    prisma.waPrompt.count({ where: { answer: "2" } }),
  ]);
  return { waiting, answeredFinish, answeredUnfinished };
}
