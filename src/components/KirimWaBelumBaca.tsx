"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";

/**
 * Tombol "ingatkan lewat WA" untuk karyawan yang belum baca hari ini.
 *
 * Bos: *"yg belum baca itu wajib list orangnya"* + *"kirim ke waha saya"*. Jadi
 * selain daftarnya tampil di dashboard, ada satu tombol untuk menembak pesan ke
 * semua yang belum — daripada admin menyalin nomor satu per satu ke WhatsApp.
 *
 * Konfirmasi dulu sebelum kirim: ini mengirim pesan NYATA ke nomor karyawan,
 * tidak bisa ditarik kembali.
 */
export function KirimWaBelumBaca({ nama }: { nama: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hasil, setHasil] = useState<{ terkirim: number; gagal: number; detail?: string } | null>(null);
  const [err, setErr] = useState("");

  async function go() {
    if (nama.length === 0) return;
    if (!confirm(`Kirim pengingat WhatsApp ke ${nama.length} orang yang belum baca hari ini?\n\n${nama.join(", ")}`)) return;
    setBusy(true);
    setErr("");
    setHasil(null);
    const r = await api<{ terkirim: number; gagal: number; detail?: string }>("/api/admin/ingatkan-baca", "POST", {});
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "Gagal mengirim");
    setHasil({ terkirim: r.terkirim, gagal: r.gagal, detail: r.detail });
    router.refresh();
  }

  return (
    <div>
      <button className="btn sm" onClick={go} disabled={busy || nama.length === 0} data-testid="kirim-wa">
        {busy ? "Mengirim…" : `📲 Ingatkan ${nama.length} orang lewat WA`}
      </button>
      {err && <div className="err" role="alert">{err}</div>}
      {hasil && (
        <div className={hasil.gagal > 0 ? "err" : "ok"} role="status">
          Terkirim ke {hasil.terkirim} orang{hasil.gagal > 0 ? `, gagal ${hasil.gagal}` : ""}.
          {hasil.detail ? ` ${hasil.detail}` : ""}
        </div>
      )}
    </div>
  );
}
