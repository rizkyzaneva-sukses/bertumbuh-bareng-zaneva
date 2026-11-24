"use client";
import { useEffect, useState } from "react";

/**
 * Tombol aktifkan notifikasi.
 *
 * Semua cabang di bawah ini NYATA dan pernah menggagalkan implementasi amatir —
 * jangan disederhanakan:
 * - `tidak-didukung`  : browser tanpa PushManager
 * - `ios-belum-install`: iPhone WAJIB Add to Home Screen (iOS 16.4+)
 * - `server-belum-siap`: kunci VAPID belum dipasang → jangan gagal senyap
 * - `ditolak`         : izin TIDAK bisa diminta ulang via JS, arahkan ke setelan
 * - `aktif`           : sudah ada langganan → tampilkan tombol matikan
 */

type Status =
  | "memuat"
  | "tidak-didukung"
  | "ios-belum-install"
  | "server-belum-siap"
  | "ditolak"
  | "mati"
  | "aktif";

/** base64url → Uint8Array. TS 5.7+ menuntut ArrayBuffer eksplisit. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  // iPadOS 13+ menyamar jadi MacIntel — sentuhan membedakannya.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** Terjemahkan error browser jadi instruksi konkret, jangan tampilkan mentah. */
function pesanError(e: unknown): string {
  const err = e as { name?: string; message?: string };
  if (err?.name === "NotAllowedError") return "Izin notifikasi ditolak. Buka ikon gembok di address bar → Notifikasi → Izinkan.";
  if (err?.name === "AbortError" || /push service error/i.test(err?.message ?? ""))
    return "HP tidak bisa menghubungi layanan notifikasi. Pastikan pakai Chrome dari Play Store, matikan mode hemat data / VPN, lalu coba lagi.";
  if (err?.name === "InvalidStateError") return "Langganan lama rusak. Tutup semua tab aplikasi ini lalu buka lagi, kemudian tekan Aktifkan sekali lagi.";
  return err?.message ?? "Gagal mengaktifkan notifikasi.";
}

export function AktifkanNotifikasi({ kompak = false }: { kompak?: boolean }) {
  const [status, setStatus] = useState<Status>("memuat");
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [perangkat, setPerangkat] = useState(0);

  useEffect(() => {
    (async () => {
      // iOS di tab Safari biasa: PushManager tidak ada sama sekali.
      if (isIOS() && !isStandalone()) return setStatus("ios-belum-install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setStatus("tidak-didukung");

      try {
        const r = await fetch("/api/push/subscribe", { cache: "no-store" });
        const d = await r.json();
        setPerangkat(d.jumlahPerangkat ?? 0);
        if (!d.terkonfigurasi) return setStatus("server-belum-siap");
      } catch {
        return setStatus("server-belum-siap");
      }

      if (Notification.permission === "denied") return setStatus("ditolak");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub ? "aktif" : "mati");
    })();
  }, []);

  async function aktifkan() {
    setSibuk(true);
    setPesan("");
    try {
      // Izin WAJIB diminta dari gesture klik — kalau dari useEffect, Chrome memblokir.
      const izin = await Notification.requestPermission();
      if (izin !== "granted") {
        setStatus(izin === "denied" ? "ditolak" : "mati");
        setPesan("Izin notifikasi belum diberikan.");
        return;
      }

      const r = await fetch("/api/push/subscribe", { cache: "no-store" });
      const d = await r.json();
      if (!d.publicKey) {
        setStatus("server-belum-siap");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      // Auto-pulih: langganan lama dengan kunci berbeda membuat subscribe gagal
      // terus. Buang dulu, lalu coba sekali lagi — user tak perlu clear data.
      if (!sub) {
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(d.publicKey),
          });
        } catch (e) {
          const lama = await reg.pushManager.getSubscription();
          if (lama) {
            await lama.unsubscribe();
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(d.publicKey),
            });
          } else throw e;
        }
      }

      const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Server menolak langganan.");
      const ok = await res.json();
      setPerangkat(ok.perangkat ?? 1);
      setStatus("aktif");
      setPesan("Notifikasi aktif di perangkat ini ✅");
    } catch (e) {
      setPesan(pesanError(e));
    } finally {
      setSibuk(false);
    }
  }

  async function matikan() {
    setSibuk(true);
    setPesan("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("mati");
      setPerangkat((n) => Math.max(0, n - 1));
      setPesan("Notifikasi dimatikan di perangkat ini.");
    } catch (e) {
      setPesan(pesanError(e));
    } finally {
      setSibuk(false);
    }
  }

  /** Tes langsung di HP, tanpa lewat server/FCM — pemisah masalah paling berguna. */
  async function tesLokal() {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) return setPesan("Service worker belum siap. Tekan Aktifkan dulu.");
      await reg.showNotification("Tes Notifikasi", {
        body: "Kalau ini muncul, HP-mu sehat dan izin sudah benar.",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        requireInteraction: true,
        silent: false,
      } as NotificationOptions);
    } catch (e) {
      setPesan(pesanError(e));
    }
  }

  if (status === "memuat") return <p className="muted" style={{ fontSize: ".85rem" }}>Memeriksa dukungan notifikasi…</p>;

  if (status === "tidak-didukung")
    return (
      <p className="muted" style={{ fontSize: ".85rem" }}>
        Browser ini belum mendukung notifikasi. Pakai <b>Chrome</b> (Android) atau <b>Safari</b> iOS 16.4+.
      </p>
    );

  if (status === "ios-belum-install")
    return (
      <div className="card" style={{ background: "var(--bg2)" }}>
        <b>iPhone perlu dipasang dulu 📲</b>
        <p className="muted" style={{ fontSize: ".85rem", margin: "6px 0 0" }}>
          1. Buka app ini di <b>Safari</b> (bukan Chrome)
          <br />
          2. Tekan tombol <b>Bagikan</b> (kotak dengan panah ke atas)
          <br />
          3. Pilih <b>Tambah ke Layar Utama</b>
          <br />
          4. Buka app dari ikon di layar utama, lalu aktifkan notifikasi
        </p>
      </div>
    );

  if (status === "server-belum-siap")
    return <p className="muted" style={{ fontSize: ".85rem" }}>Notifikasi belum disiapkan admin. Hubungi admin ya.</p>;

  if (status === "ditolak")
    return (
      <div className="card" style={{ background: "var(--red-soft)" }}>
        <b>Izin notifikasi diblokir</b>
        <p className="muted" style={{ fontSize: ".85rem", margin: "6px 0 0" }}>
          Izin tidak bisa diminta ulang dari dalam app. Buka ikon <b>gembok</b> di sebelah alamat situs → <b>Notifikasi</b> →{" "}
          <b>Izinkan</b>, lalu muat ulang halaman ini.
        </p>
      </div>
    );

  return (
    <div>
      {status === "aktif" ? (
        <div className="row">
          <span className="chip green">Notifikasi aktif</span>
          {perangkat > 1 && <span className="muted" style={{ fontSize: ".78rem" }}>{perangkat} perangkat</span>}
        </div>
      ) : null}

      {!kompak && status === "aktif" && (
        <p className="muted" style={{ fontSize: ".82rem", margin: "8px 0 0" }}>
          Kamu akan dapat kabar saat ada buku baru dan saat buku hampir jatuh tempo.
        </p>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        {status === "mati" ? (
          <button className="btn sm" disabled={sibuk} onClick={aktifkan} data-testid="aktifkan-push">
            {sibuk ? "…" : "Aktifkan notifikasi"}
          </button>
        ) : (
          <>
            <button className="btn sm ghost" disabled={sibuk} onClick={matikan} data-testid="matikan-push">
              {sibuk ? "…" : "Matikan di perangkat ini"}
            </button>
            <button className="btn sm soft" onClick={tesLokal} data-testid="tes-lokal">
              Tes di HP ini
            </button>
          </>
        )}
      </div>

      {pesan && (
        <div className={pesan.includes("✅") ? "ok" : "err"} role="status" style={{ marginTop: 8 }}>
          {pesan}
        </div>
      )}
    </div>
  );
}
