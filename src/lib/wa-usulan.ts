import { prisma } from "@/lib/db";
import { wahaSendText, wahaFetchMessages, type SendText } from "@/lib/waha";
import { displayPhone } from "@/lib/phone";

/**
 * Usulan buku lewat WhatsApp.
 *
 * Bos: karyawan minta buku lewat bot WA, bot merekap di app, dan **peminta
 * dikabari lewat WA**. Cukup judul; link Shopee opsional.
 *
 * Pemicu sengaja memakai kata kunci `#usul` supaya obrolan biasa tidak ikut
 * tercatat sebagai usulan buku.
 */

export const PEMICU = "#usul";

export type UsulanParsed = { title: string; url: string; note: string } | null;

/** Ambil URL pertama di teks (Shopee/Tokopedia/dll). */
function ambilUrl(t: string): { url: string; sisa: string } {
  const m = t.match(/https?:\/\/[^\s]+/i);
  if (!m) return { url: "", sisa: t };
  return { url: m[0], sisa: (t.slice(0, m.index) + " " + t.slice((m.index ?? 0) + m[0].length)).trim() };
}

/**
 * Baca pesan usulan. Format yang diterima:
 *
 *   #usul Atomic Habits
 *   #usul Atomic Habits https://shopee.co.id/...
 *   usul: Atomic Habits
 *   mau usul buku Atomic Habits
 *
 * Yang WAJIB ditolak: pesan tanpa pemicu, dan pesan yang setelah pemicunya
 * kosong (mis. cuma "#usul").
 */
export function parseUsulan(raw: string): UsulanParsed {
  const teks = String(raw ?? "").trim();
  if (!teks) return null;

  // Harus ada pemicunya. Tanpa ini, "mau pinjam buku X" akan salah tercatat.
  const adaPemicu = new RegExp(`${PEMICU}|\\busul(?:an)?\\b`, "i").test(teks);
  if (!adaPemicu) return null;

  let sisa = teks
    .replace(new RegExp(PEMICU, "gi"), " ")
    .replace(/\b(?:mau|ingin|pengen|pingin)\s+usul(?:an)?(?:\s+buku)?\b/gi, " ")
    .replace(/\busul(?:an)?\s*(?:buku)?\s*[:\-]?/gi, " ")
    .replace(/^\s*[:\-]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  const { url, sisa: tanpaUrl } = ambilUrl(sisa);
  sisa = tanpaUrl.replace(/\s+/g, " ").trim();

  if (!sisa || sisa.length < 2) return null;

  // Judul = maksimal 200 char; sisanya jadi catatan supaya tidak hilang.
  const title = sisa.slice(0, 200).trim();
  const note = sisa.length > 200 ? sisa.slice(200).trim() : "";
  return { title, url, note };
}

/** Teks balasan ke peminta — gaya chat: sapaan + 1 pertanyaan, maks ~5 baris. */
export function balasanUsulan(nama: string, judul: string) {
  const panggil = (nama || "").trim().split(" ")[0] || "Kak";
  return (
    `Noted ${panggil} ✅\n` +
    `"${judul}" sudah masuk daftar usulan buku.\n` +
    `Mau dikabari kalau bukunya sudah ada?`
  );
}

export type HasilUsulan = { tercatat: boolean; id?: string; judul?: string; alasan?: string };

/**
 * Catat usulan dari WA + balas ke peminta.
 *
 * Idempoten per (telepon, judul) dalam 1 jam terakhir: orang yang mengirim dua
 * kali karena tidak yakin tidak membuat dua baris di rekap admin.
 */
export async function catatUsulanWa(
  phone: string,
  namaWa: string,
  body: string,
  opts: { send?: SendText; balas?: boolean } = {},
): Promise<HasilUsulan> {
  const parsed = parseUsulan(body);
  if (!parsed) return { tercatat: false, alasan: "bukan usulan" };

  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true, name: true } });

  const baru = await prisma.bookRequest.findFirst({
    where: {
      phone,
      title: parsed.title,
      createdAt: { gte: new Date(Date.now() - 3600_000) },
    },
    select: { id: true },
  });
  if (baru) return { tercatat: false, id: baru.id, judul: parsed.title, alasan: "sudah tercatat" };

  const row = await prisma.bookRequest.create({
    data: {
      userId: user?.id ?? null,
      phone,
      name: (user?.name || namaWa || "").slice(0, 120),
      title: parsed.title,
      url: parsed.url.slice(0, 500),
      note: parsed.note.slice(0, 500),
      source: "WA",
      rawText: String(body ?? "").slice(0, 1000),
    },
    select: { id: true, title: true },
  });

  if (opts.balas !== false) {
    const send = opts.send ?? wahaSendText;
    try {
      await send(phone, balasanUsulan(user?.name || namaWa || "", row.title));
    } catch (e) {
      // Usulan SUDAH tercatat; gagal balas WA tidak boleh membatalkannya.
      console.error("[usulan] gagal kirim balasan:", String((e as Error).message ?? e));
    }
  }

  return { tercatat: true, id: row.id, judul: row.title };
}

/** Kabari peminta lewat WA bahwa bukunya sudah ada / sudah diputuskan. */
export async function kabariPemintaWa(
  requestId: string,
  status: "DIBELI" | "DITOLAK" | "DIPERTIMBANGKAN",
  opts: { send?: SendText } = {},
) {
  const r = await prisma.bookRequest.findUnique({ where: { id: requestId } });
  if (!r) return { terkirim: false, alasan: "tidak ditemukan" };

  const panggil = (r.name || "").trim().split(" ")[0] || "Kak";
  const teks =
    status === "DIBELI"
      ? `Kabar baik ${panggil} 🎉\n"${r.title}" sudah masuk rak perpustakaan.\nMau langsung pinjam sekarang?`
      : status === "DIPERTIMBANGKAN"
        ? `Usulanmu "${r.title}" sedang dipertimbangkan ${panggil} 📚\nNanti saya kabari lagi ya.`
        : `Mohon maaf ${panggil}, usulan "${r.title}" belum bisa kami adakan tahun ini 🙏\nKalau ada judul lain, kirim saja lewat ${PEMICU}`;

  const send = opts.send ?? wahaSendText;
  try {
    await send(r.phone, teks);
    return { terkirim: true, ke: displayPhone(r.phone) };
  } catch (e) {
    console.error("[usulan] gagal kabari peminta:", String((e as Error).message ?? e));
    return { terkirim: false, alasan: String((e as Error).message ?? e) };
  }
}

/**
 * Baca pesan `#usul` dari WhatsApp.
 *
 * Kenapa polling, bukan webhook: sesi WAHA `tehayu` sudah punya webhook ke n8n
 * (`wa-order-extract`). Menambah webhook kedua = mengubah konfigurasi sesi yang
 * dipakai alur order gudang — risiko yang tidak perlu. Membaca pesan per-chat
 * lewat REST aman dan tidak menyentuh sesi.
 *
 * Berbeda dari `pollPromptReplies` yang hanya membaca chat orang yang punya
 * pertanyaan terbuka, di sini SEMUA anggota diperiksa: usulan bisa datang kapan
 * saja tanpa dipicu apa pun.
 */
export type PollUsulanResult = { dicek: number; usulan: number; dilewati: number };

export const JENDELA_POLL_MS = 2 * 86400000;

export async function pollUsulanWa(
  opts: { now?: Date; send?: SendText; fetchMessages?: typeof wahaFetchMessages; batas?: number } = {},
): Promise<PollUsulanResult> {
  const now = opts.now ?? new Date();
  const send = opts.send ?? wahaSendText;
  const fetchMessages = opts.fetchMessages ?? wahaFetchMessages;

  const users = await prisma.user.findMany({
    select: { id: true, phone: true, name: true },
    take: opts.batas ?? 200,
  });

  const out: PollUsulanResult = { dicek: 0, usulan: 0, dilewati: 0 };
  const sinceMs = now.getTime() - JENDELA_POLL_MS;

  for (const u of users) {
    const key = `wa_usul_seen:${u.id}`;
    const row = await prisma.setting.findUnique({ where: { key } });
    const seenTs = row ? Number(row.value) || 0 : 0;

    let msgs;
    try {
      msgs = await fetchMessages(u.phone, sinceMs);
    } catch (e) {
      console.error("[usulan] gagal baca pesan:", String((e as Error).message ?? e));
      continue;
    }
    out.dicek++;

    const masuk = msgs.filter((m) => !m.fromMe).sort((a, b) => a.timestamp - b.timestamp);
    let newest = seenTs;

    for (const m of masuk) {
      const tsMs = m.timestamp * 1000;
      if (tsMs <= seenTs) continue;
      newest = Math.max(newest, tsMs);
      if (!parseUsulan(m.body)) continue;
      try {
        const h = await catatUsulanWa(u.phone, u.name, m.body, { send });
        if (h.tercatat) out.usulan++;
        else out.dilewati++;
      } catch (e) {
        console.error("[usulan] gagal catat:", String((e as Error).message ?? e));
      }
    }

    if (newest > seenTs) {
      await prisma.setting.upsert({
        where: { key },
        create: { key, value: String(newest) },
        update: { value: String(newest) },
      });
    }
  }

  return out;
}
