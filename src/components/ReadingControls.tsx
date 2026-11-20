"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";

/** Bar progres tipis; tetap terlihat walau 0%. */
export function ProgressBar({ percent }: { percent: number }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div
      style={{ background: "var(--bg2)", borderRadius: 999, height: 8, overflow: "hidden", marginTop: 6 }}
      role="progressbar"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div style={{ width: `${p}%`, height: "100%", background: "var(--accent)", transition: "width .2s" }} />
    </div>
  );
}

/**
 * Input halaman terakhir + tombol beres baca.
 *
 * Dipakai di Beranda (buku yang sedang dipinjam) DAN di Riwayat (buku yang sudah
 * dikembalikan). Justru yang kedua itu inti permintaan Bos: buku sudah balik ke
 * rak, tapi bacaannya belum tuntas dan harus bisa dilanjutkan.
 */
export function ReadingControls({
  bookId,
  title,
  totalPages,
  lastPage,
  finished,
  compact = false,
}: {
  bookId: string;
  title: string;
  totalPages: number | null;
  lastPage: number;
  finished: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [page, setPage] = useState(String(lastPage || ""));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    const n = Number(page);
    if (!Number.isFinite(n) || n < 0) return setMsg({ ok: false, text: "Isi angka halaman yang benar." });
    if (totalPages && n > totalPages) return setMsg({ ok: false, text: `Maksimal ${totalPages} halaman.` });
    setBusy(true);
    const r = await api<{ progress?: { lastPage: number; percent: number; status: string } }>("/api/progress", "POST", {
      bookId,
      lastPage: n,
    });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Gagal menyimpan" });
    const p = r.progress!;
    setMsg({
      ok: true,
      text: p.status === "SELESAI" ? "Tercatat — buku ini selesai dibaca! 🎉" : `Tersimpan di halaman ${p.lastPage} (${p.percent}%)`,
    });
    router.refresh();
  }

  async function toggleDone(next: boolean) {
    setBusy(true);
    const r = await api("/api/progress", "POST", { bookId, done: next });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Gagal" });
    setMsg({ ok: true, text: next ? "Ditandai beres baca 🎉" : "Tanda beres dibatalkan." });
    router.refresh();
  }

  return (
    <div style={{ marginTop: 8 }} data-testid={compact ? "progress-compact" : "progress"}>
      {finished ? (
        <div className="row between">
          <span className="chip green">✓ Selesai dibaca</span>
          <button className="btn sm ghost" disabled={busy} onClick={() => toggleDone(false)} data-testid="unfinish">
            Batalkan
          </button>
        </div>
      ) : (
        <>
          <div className="row" style={{ gap: 6 }}>
            <label className="small muted" htmlFor={`pg-${bookId}`} style={{ margin: 0 }}>
              Terakhir halaman
            </label>
            <input
              id={`pg-${bookId}`}
              inputMode="numeric"
              type="number"
              min={0}
              max={totalPages ?? undefined}
              value={page}
              onChange={(e) => setPage(e.target.value)}
              placeholder="0"
              style={{ width: 90, margin: 0 }}
              data-testid="page-input"
            />
            {totalPages ? <span className="small muted">/ {totalPages}</span> : null}
            <button className="btn sm soft" disabled={busy} onClick={save} data-testid="save-page">
              {busy ? "…" : "Simpan"}
            </button>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn sm ghost" disabled={busy} onClick={() => toggleDone(true)} data-testid="mark-finished">
              ✓ Beres baca
            </button>
          </div>
        </>
      )}
      {msg && <div className={msg.ok ? "ok" : "err"} role="status">{msg.text}</div>}
    </div>
  );
}

/**
 * Tombol perpanjang.
 *
 * Alurnya sengaja TIDAK memaksa "balikin dulu": jatuh tempo digeser selama
 * batas perpanjangan belum habis. Server yang memutuskan (bisa menolak kalau
 * bukunya diantre orang lain), UI hanya menampilkan hasilnya.
 */
export function RenewButton({ loanId, dueLabel, renewLeft }: { loanId: string; dueLabel: string; renewLeft: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function go() {
    if (!confirm(`Perpanjang "${dueLabel}" jadi 3 hari kerja lagi? (sisa ${renewLeft}× perpanjangan)`)) return;
    setBusy(true);
    const r = await api<{ dueLabel?: string; renewLeft?: number }>(`/api/loans/${loanId}/renew`, "POST", {});
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Gagal memperpanjang" });
    setMsg({ ok: true, text: `Diperpanjang sampai ${r.dueLabel}. Sisa perpanjangan: ${r.renewLeft}×` });
    router.refresh();
  }

  if (renewLeft <= 0)
    return <span className="small muted" data-testid="renew-exhausted">Perpanjangan habis — balikin dulu ya</span>;

  return (
    <div>
      <button className="btn sm ghost" disabled={busy} onClick={go} data-testid="renew">
        {busy ? "…" : `Perpanjang (sisa ${renewLeft}×)`}
      </button>
      {msg && <div className={msg.ok ? "ok" : "err"} role="status">{msg.text}</div>}
    </div>
  );
}
