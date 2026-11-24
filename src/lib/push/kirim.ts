// web-push TIDAK punya default export — pakai named import. `import webpush
// from "web-push"` gagal saat `next build` dengan "Export default doesn't exist".
import { setVapidDetails, sendNotification as webpushSend } from "web-push";
import { prisma } from "@/lib/db";

/**
 * Pengirim Web Push.
 *
 * Tidak perlu daftar ke Google/Apple dan tidak ada biaya: kunci VAPID adalah
 * identitas server kita sendiri ke layanan push browser.
 *
 * Aturan penting:
 * - Kirim SEQUENTIAL, jangan Promise.all — jangan membanjiri FCM/APNs.
 * - Endpoint yang dibalas 404/410 artinya perangkat sudah hilang (app
 *   di-uninstall, data browser dibersihkan). Baris WAJIB dihapus, kalau tidak
 *   tabel menumpuk sampah dan tiap pengiriman makin lambat.
 */

export type Payload = { title: string; body: string; url?: string; tag?: string };

export type HasilKirim = {
  terkonfigurasi: boolean;
  tujuan: number;
  terkirim: number;
  dihapus: number;
  gagal: number;
};

export function pushTerkonfigurasi(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function siapkan() {
  setVapidDetails(
    process.env.VAPID_SUBJECT as string,
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
}

/** Kunci publik untuk browser. Null kalau server belum siap. */
export function kunciPublik(): string | null {
  return pushTerkonfigurasi() ? (process.env.VAPID_PUBLIC_KEY as string) : null;
}

/**
 * Kirim ke daftar userId. Idempoten; aman dipanggil berkali-kali.
 * `url` harus halaman yang boleh dibuka PENERIMA (bukan /admin).
 */
export async function kirimPushKeUser(userIds: string[], payload: Payload): Promise<HasilKirim> {
  const out: HasilKirim = { terkonfigurasi: pushTerkonfigurasi(), tujuan: 0, terkirim: 0, dihapus: 0, gagal: 0 };
  if (!out.terkonfigurasi) return out;
  if (userIds.length === 0) return out;

  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  out.tujuan = subs.length;
  if (subs.length === 0) return out;

  siapkan();
  const body = JSON.stringify({ ...payload, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png" });

  for (const s of subs) {
    try {
      await webpushSend(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { TTL: 60 * 60 * 12, urgency: "high" },
      );
      out.terkirim++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // Perangkat sudah tidak ada — bersihkan supaya tidak dikirimi terus.
        await prisma.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
        out.dihapus++;
      } else {
        out.gagal++;
        console.error(`[push] gagal ${status ?? "?"}: ${String((e as Error).message ?? e).slice(0, 160)}`);
      }
    }
  }
  return out;
}

/** Kirim ke SEMUA anggota (untuk pengumuman buku baru). Admin boleh ikut. */
export async function kirimPushKeSemua(payload: Payload, opts: { kecualiUserId?: string } = {}): Promise<HasilKirim> {
  const users = await prisma.user.findMany({
    where: opts.kecualiUserId ? { id: { not: opts.kecualiUserId } } : {},
    select: { id: true },
  });
  return kirimPushKeUser(users.map((u) => u.id), payload);
}

/**
 * Kabari semua anggota ada buku baru.
 *
 * Bos: *"App munculin notif dong kaya app rajinibadah biar semua dapet notif
 * klo ada buku baru"*. Dipanggil dari API tambah buku, jadi tidak perlu cron.
 */
export async function kabariBukuBaru(judul: string, penulis: string) {
  return kirimPushKeSemua({
    title: "📚 Buku baru di rak!",
    body: `${judul}${penulis ? ` — ${penulis}` : ""}. Langsung pinjam sebelum kehabisan.`,
    url: "/buku",
    tag: "buku-baru",
  });
}
