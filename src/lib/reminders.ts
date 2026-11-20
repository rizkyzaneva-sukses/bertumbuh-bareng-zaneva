import { prisma } from "./db";
import { dayOfWeek, diffDays, formatTanggal, jakartaHour, jakartaKey, keyFromDbDate } from "./dates";
import { issueReturnToken } from "./loans";
import { returnUrl } from "./tokens";
import { wahaSendText, type SendText } from "./waha";
import { displayPhone } from "./phone";
import { deliverPendingPrompts, pollPromptReplies } from "./wa-prompts";
import type { ReminderKind } from "../generated/prisma/client";

/** Jam kirim pengingat (WIB). Job boleh jalan kapan saja; mengirim hanya di jendela ini. */
export const SEND_FROM_HOUR = 8;
export const SEND_UNTIL_HOUR = 20; // batas atas (eksklusif) supaya tidak kirim larut malam kalau server telat hidup
export const MAX_ATTEMPTS_PER_DAY = 3;
const STALE_PENDING_MS = 15 * 60 * 1000;

export function firstReminderText(name: string, title: string, dueKey: string, url: string) {
  return (
    `Halo ${name} 👋\n\n` +
    `Pengingat dari Bertumbuh Bareng Zaneva: buku "${title}" jatuh tempo hari ini (${formatTanggal(dueKey)}).\n\n` +
    `Kalau sudah selesai dibaca, balikin lewat link ini ya:\n${url}\n\n` +
    `Terima kasih sudah bertumbuh bareng! 🌱`
  );
}

/** Teks polos tanpa link/tombol, supaya nomor WA aman dari risiko diblokir. */
export function followUpText(name: string, title: string, daysLate: number) {
  return (
    `Halo ${name}, buku "${title}" sudah lewat jatuh tempo ${daysLate} hari.\n\n` +
    `Mohon segera dikembalikan ya, lalu tandai sudah balik lewat aplikasi Bertumbuh Bareng Zaneva (menu Pinjaman Saya) atau kabari admin.\n\n` +
    `Terima kasih 🙏`
  );
}

/** Rekap keterlambatan untuk admin — dikirim sekali per hari, bukan per buku. */
export function adminLateText(rows: { name: string; title: string; daysLate: number }[], total: number) {
  const daftar = rows.map((r) => `• ${r.name} — "${r.title}" (telat ${r.daysLate} hari)`).join("\n");
  const sisa = total - rows.length;
  return (
    `Rekap keterlambatan Bertumbuh Bareng Zaneva\n\n` +
    `${total} buku belum dikembalikan:\n${daftar}` +
    (sisa > 0 ? `\n• … dan ${sisa} lainnya` : "") +
    `\n\nCek di panel admin untuk menindaklanjuti.`
  );
}

export type JobOptions = {
  now?: Date;
  send?: SendText;
  /** jeda acak antar kirim (ms); default dari env REMINDER_DELAY_MIN_MS/MAX_MS (3-9 dtk) */
  delayMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** abaikan jendela jam kirim (untuk uji/manual) */
  ignoreWindow?: boolean;
};

export type JobResult = {
  today: string;
  skipped?: string;
  markedLate: number;
  sent: number;
  failed: number;
  alreadyDone: number;
  /** Rekap keterlambatan untuk admin: terkirim / gagal / dilewati. */
  adminSent?: number;
  adminFailed?: number;
  adminSkipped?: string;
};

function defaultDelay() {
  const min = Number(process.env.REMINDER_DELAY_MIN_MS ?? 3000);
  const max = Number(process.env.REMINDER_DELAY_MAX_MS ?? 9000);
  return min + Math.random() * Math.max(0, max - min);
}

let running = false;

export async function runReminderJob(opts: JobOptions = {}): Promise<JobResult> {
  const now = opts.now ?? new Date();
  const send = opts.send ?? wahaSendText;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const delay = opts.delayMs ?? defaultDelay;
  const today = jakartaKey(now);
  const result: JobResult = { today, markedLate: 0, sent: 0, failed: 0, alreadyDone: 0 };

  // tandai terlambat (aman dijalankan kapan saja)
  const late = await prisma.loan.updateMany({
    where: { returnedAt: null, status: "DIPINJAM", dueDate: { lt: new Date(today + "T00:00:00Z") } },
    data: { status: "TERLAMBAT" },
  });
  result.markedLate = late.count;

  const hour = jakartaHour(now);
  if (!opts.ignoreWindow) {
    if (hour < SEND_FROM_HOUR) return { ...result, skipped: "belum jam 08.00 WIB" };
    if (hour >= SEND_UNTIL_HOUR) return { ...result, skipped: "lewat jendela kirim (>= 20.00 WIB)" };
  }
  // Hari Ahad tidak ada pengingat (pengingat yang jatuh di Ahad dilanjutkan Senin).
  if (dayOfWeek(today) === 0) return { ...result, skipped: "hari Ahad" };
  if (running) return { ...result, skipped: "job sedang berjalan" };
  running = true;
  try {
    const loans = await prisma.loan.findMany({
      where: { returnedAt: null, dueDate: { lte: new Date(today + "T00:00:00Z") } },
      include: { user: true, book: true, reminders: true },
      orderBy: [{ dueDate: "asc" }, { borrowedAt: "asc" }],
    });
    let first = true;
    for (const loan of loans) {
      const todays = loan.reminders.find((r) => r.sentOn === today);
      if (todays?.status === "SENT") {
        result.alreadyDone++;
        continue;
      }
      // klaim baris (loanId, sentOn): unik di DB, jadi dua proses tidak bisa mengirim dobel
      const kind: ReminderKind = loan.reminders.some((r) => r.kind === "FIRST_LINK" && r.status === "SENT")
        ? "FOLLOW_UP"
        : "FIRST_LINK";
      let logId: string;
      if (!todays) {
        try {
          const created = await prisma.reminderLog.create({
            data: { loanId: loan.id, sentOn: today, kind, status: "PENDING", attempts: 1 },
          });
          logId = created.id;
        } catch {
          result.alreadyDone++; // proses lain sudah mengklaim
          continue;
        }
      } else {
        const stale = new Date(now.getTime() - STALE_PENDING_MS);
        if (todays.attempts >= MAX_ATTEMPTS_PER_DAY) continue;
        const claimed = await prisma.reminderLog.updateMany({
          where: {
            id: todays.id,
            OR: [{ status: "FAILED" }, { status: "PENDING", updatedAt: { lt: stale } }],
          },
          data: { status: "PENDING", kind, attempts: { increment: 1 }, error: null },
        });
        if (claimed.count === 0) {
          result.alreadyDone++;
          continue;
        }
        logId = todays.id;
      }

      if (!first) await sleep(Math.round(delay()));
      first = false;

      try {
        let text: string;
        const dueKey = keyFromDbDate(loan.dueDate);
        if (kind === "FIRST_LINK") {
          const token = await issueReturnToken(loan.id, now);
          text = firstReminderText(loan.user.name.trim() || `kak ${displayPhone(loan.user.phone)}`, loan.book.title, dueKey, returnUrl(token));
        } else {
          text = followUpText(loan.user.name.trim() || `kak ${displayPhone(loan.user.phone)}`, loan.book.title, Math.max(1, diffDays(dueKey, today)));
        }
        await send(loan.user.phone, text);
        // simpan teks tanpa token supaya log tidak menyimpan link aktif
        const stored = kind === "FIRST_LINK" ? text.replace(/\S*\/kembali\/\S+/, "[link pengembalian]") : text;
        await prisma.reminderLog.update({ where: { id: logId }, data: { status: "SENT", message: stored } });
        result.sent++;
      } catch (e) {
        await prisma.reminderLog.update({
          where: { id: logId },
          data: { status: "FAILED", error: String((e as Error).message ?? e).slice(0, 500) },
        });
        result.failed++;
      }
    }
  } finally {
    running = false;
  }

  // Rekap keterlambatan untuk admin: sekali sehari, setelah pengingat peminjam selesai.
  // Admin bisa meminjam juga, jadi dia tetap dapat pengingat pribadi di atas — ini tambahan
  // supaya dia tahu kondisi seluruh tim tanpa harus buka panel.
  try {
    const lateLoans = await prisma.loan.findMany({
      where: { returnedAt: null, dueDate: { lt: new Date(today + "T00:00:00Z") } },
      include: { user: true, book: true },
      orderBy: [{ dueDate: "asc" }],
    });
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { phone: true },
    });
    if (lateLoans.length === 0) {
      result.adminSkipped = "tidak ada buku terlambat";
    } else if (admins.length === 0) {
      result.adminSkipped = "belum ada admin";
    } else {
      const MAX_ROWS = 10;
      const rows = lateLoans.slice(0, MAX_ROWS).map((l) => ({
        name: l.user.name.trim() || displayPhone(l.user.phone),
        title: l.book.title,
        daysLate: Math.max(1, diffDays(keyFromDbDate(l.dueDate), today)),
      }));
      const text = adminLateText(rows, lateLoans.length);
      let ok = 0;
      let bad = 0;
      for (const a of admins) {
        // Penjaga dobel: satu rekap per admin per hari.
        const key = `admin_late:${today}:${a.phone}`;
        const claimed = await prisma.setting
          .create({ data: { key, value: new Date().toISOString() } })
          .catch(() => null);
        if (!claimed) continue;
        try {
          await send(a.phone, text);
          ok++;
        } catch {
          await prisma.setting.delete({ where: { key } }).catch(() => {});
          bad++;
        }
      }
      result.adminSent = ok;
      result.adminFailed = bad;
    }
  } catch (e) {
    result.adminSkipped = `gagal: ${String((e as Error).message ?? e).slice(0, 120)}`;
  }

  return result;
}

let started = false;
/** Jalankan job tiap 5 menit di dalam server Node (dipanggil dari instrumentation.ts). */
export function startReminderScheduler() {
  if (started) return;
  started = true;
  const tick = () =>
    runReminderJob()
      .then((r) => {
        if (r.sent || r.failed) console.log("[pengingat]", JSON.stringify(r));
      })
      .catch((e) => console.error("[pengingat] gagal:", e));
  setTimeout(tick, 30_000);
  setInterval(tick, 5 * 60_000).unref?.();

  // Pertanyaan "beres bacanya?" + pembacaan jawaban 1/2.
  // Dijalankan di tick yang sama tapi terpisah dari job pengingat, supaya
  // kegagalan salah satunya tidak mematikan yang lain.
  const tickPrompts = async () => {
    try {
      const sent = await deliverPendingPrompts({ limit: 10 });
      if (sent.sent || sent.failed) console.log("[wa-prompt] terkirim:", JSON.stringify(sent));
    } catch (e) {
      console.error("[wa-prompt] gagal kirim:", e);
    }
    try {
      const polled = await pollPromptReplies();
      if (polled.answered || polled.replied) console.log("[wa-prompt] jawaban:", JSON.stringify(polled));
    } catch (e) {
      console.error("[wa-prompt] gagal poll:", e);
    }
  };
  setTimeout(tickPrompts, 90_000);
  setInterval(tickPrompts, 5 * 60_000).unref?.();

  console.log(
    "[pengingat] scheduler aktif (cek tiap 5 menit, kirim 08.00-20.00 WIB) · " +
      "pertanyaan beres-baca + poll jawaban WA juga aktif",
  );
}
