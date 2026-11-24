"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";

type Usulan = {
  id: string;
  name: string;
  phone: string;
  title: string;
  url: string;
  status: string;
  source: string;
  createdAt: string;
};

const LABEL: Record<string, { t: string; c: string }> = {
  BARU: { t: "Baru", c: "chip amber" },
  DIPERTIMBANGKAN: { t: "Dipertimbangkan", c: "chip accent" },
  DIBELI: { t: "Dibeli ✓", c: "chip green" },
  DITOLAK: { t: "Ditolak", c: "chip red" },
};

const tgl = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

/** Rekap usulan buku — satu daftar, bukan scroll chat WA satu per satu. */
export function AdminRequests({ awal }: { awal: Usulan[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Usulan[]>(awal);
  const [sibuk, setSibuk] = useState("");
  const [pesan, setPesan] = useState("");

  async function ubah(id: string, status: string) {
    setSibuk(id);
    setPesan("");
    const r = await api<{ wa?: { terkirim: boolean; alasan?: string; ke?: string } }>("/api/admin/requests", "POST", {
      id,
      status,
      kabari: true,
    });
    setSibuk("");
    if (!r.ok) return setPesan(r.error ?? "Gagal mengubah status.");
    setRows((l) => l.map((x) => (x.id === id ? { ...x, status } : x)));
    if (r.wa) {
      setPesan(
        r.wa.terkirim
          ? `Status diperbarui & WA terkirim ke ${r.wa.ke ?? "peminta"} ✅`
          : `Status diperbarui, tapi WA gagal: ${r.wa.alasan ?? "tidak diketahui"}`,
      );
    } else setPesan("Status diperbarui.");
    router.refresh();
  }

  if (rows.length === 0) return <div className="card muted">Belum ada usulan buku.</div>;

  return (
    <>
      {pesan && <div className={pesan.includes("✅") ? "ok" : "err"} style={{ marginBottom: 10 }}>{pesan}</div>}
      {rows.map((u) => {
        const s = LABEL[u.status] ?? LABEL.BARU;
        return (
          <div className="card" key={u.id} data-testid="admin-usulan">
            <div className="row between">
              <b style={{ minWidth: 0 }}>{u.title}</b>
              <span className={s.c}>{s.t}</span>
            </div>
            <p className="muted" style={{ fontSize: ".78rem", margin: "4px 0 0" }}>
              {u.name || u.phone} · {tgl(u.createdAt)} · lewat {u.source}
            </p>
            {u.url ? (
              <a href={u.url} target="_blank" rel="noreferrer" style={{ fontSize: ".78rem", wordBreak: "break-all" }}>
                {u.url.slice(0, 60)}
              </a>
            ) : null}
            <div className="row" style={{ marginTop: 8 }}>
              {u.status !== "DIBELI" && (
                <button className="btn sm" disabled={sibuk === u.id} onClick={() => ubah(u.id, "DIBELI")} data-testid="tandai-dibeli">
                  {sibuk === u.id ? "…" : "Sudah dibeli"}
                </button>
              )}
              {u.status !== "DITOLAK" && (
                <button className="btn sm ghost" disabled={sibuk === u.id} onClick={() => ubah(u.id, "DITOLAK")}>
                  Tolak
                </button>
              )}
              {u.status !== "BARU" && (
                <button className="btn sm ghost" disabled={sibuk === u.id} onClick={() => ubah(u.id, "BARU")}>
                  Tandai baru
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
