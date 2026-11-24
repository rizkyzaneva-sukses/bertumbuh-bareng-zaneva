"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

type Usulan = { id: string; title: string; url: string; status: string; createdAt: string };

const LABEL: Record<string, { t: string; c: string }> = {
  BARU: { t: "Baru", c: "chip amber" },
  DIPERTIMBANGKAN: { t: "Dipertimbangkan", c: "chip accent" },
  DIBELI: { t: "Sudah dibeli ✓", c: "chip green" },
  DITOLAK: { t: "Belum bisa", c: "chip red" },
};

/** Form usulan buku untuk anggota — jalur alternatif selain `#usul` di WA. */
export function UsulanBuku({ awal }: { awal: Usulan[] }) {
  const [judul, setJudul] = useState("");
  const [url, setUrl] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ ok: boolean; t: string } | null>(null);
  const [daftar, setDaftar] = useState<Usulan[]>(awal);

  async function kirim() {
    if (judul.trim().length < 2) return setPesan({ ok: false, t: "Judul buku minimal 2 karakter." });
    setSibuk(true);
    setPesan(null);
    const r = await api<{ dobel?: boolean; pesan?: string; usulan?: { id: string; title: string } }>("/api/requests", "POST", {
      title: judul.trim(),
      url: url.trim(),
    });
    setSibuk(false);
    if (!r.ok) return setPesan({ ok: false, t: r.error ?? "Gagal mengirim usulan." });
    if (r.dobel) return setPesan({ ok: false, t: r.pesan ?? "Usulan ini sudah kamu kirim." });
    setPesan({ ok: true, t: "Usulan terkirim ✅ Admin akan meninjau." });
    setDaftar((l) => [
      {
        id: r.usulan?.id ?? String(Date.now()),
        title: r.usulan?.title ?? judul.trim(),
        url: url.trim(),
        status: "BARU",
        createdAt: new Date().toISOString(),
      },
      ...l,
    ]);
    setJudul("");
    setUrl("");
  }

  return (
    <>
      <div className="card">
        <b>Usulkan buku</b>
        <p className="muted" style={{ fontSize: ".83rem", margin: "4px 0 10px" }}>
          Tidak menemukan buku yang kamu cari? Tulis judulnya. Link toko (Shopee/Tokopedia) boleh, tidak wajib.
        </p>
        <div className="field">
          <label htmlFor="usul-judul">Judul buku</label>
          <input id="usul-judul" value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="mis. Filosofi Teras" maxLength={200} data-testid="usul-judul" />
        </div>
        <div className="field">
          <label htmlFor="usul-url">Link toko (opsional)</label>
          <input id="usul-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://shopee.co.id/..." maxLength={500} data-testid="usul-url" />
        </div>
        <button className="btn sm" disabled={sibuk} onClick={kirim} data-testid="usul-kirim">
          {sibuk ? "…" : "Kirim usulan"}
        </button>
        {pesan && <div className={pesan.ok ? "ok" : "err"} role="status" style={{ marginTop: 8 }}>{pesan.t}</div>}
      </div>

      <h2 style={{ marginTop: 18 }}>Usulanmu ({daftar.length})</h2>
      {daftar.length === 0 ? (
        <div className="card muted">Belum ada usulan. Kirim judul buku yang kamu mau.</div>
      ) : (
        daftar.map((u) => {
          const s = LABEL[u.status] ?? LABEL.BARU;
          return (
            <div className="card" key={u.id} data-testid="usulan-saya">
              <div className="row between">
                <b style={{ minWidth: 0 }}>{u.title}</b>
                <span className={s.c}>{s.t}</span>
              </div>
              {u.url ? (
                <a href={u.url} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: ".78rem" }}>
                  {u.url.slice(0, 48)}…
                </a>
              ) : null}
            </div>
          );
        })
      )}
    </>
  );
}
