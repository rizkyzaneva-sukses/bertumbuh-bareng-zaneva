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
  const [pesan, setPesan] = useState<{ ok: boolean; t: string } | null>(null);

  async function ubah(id: string, status: string) {
    setSibuk(id);
    setPesan(null);
    const r = await api<{
      wa?: { terkirim: boolean; alasan?: string; ke?: string };
      push?: { tujuan: number; terkirim: number } | null;
    }>("/api/admin/requests", "POST", { id, status, kabari: true });
    setSibuk("");
    if (!r.ok) return setPesan({ ok: false, t: r.error ?? "Gagal mengubah status." });
    setRows((l) => l.map((x) => (x.id === id ? { ...x, status } : x)));

    // Kabar ke peminta: WA dan notifikasi app dilaporkan terpisah, karena
    // salah satunya bisa gagal tanpa membatalkan yang lain.
    const bagian: string[] = ["Status diperbarui"];
    let gagal = false;
    if (r.wa) {
      if (r.wa.terkirim) bagian.push(`WA terkirim ke ${r.wa.ke ?? "peminta"}`);
      else {
        gagal = true;
        bagian.push(`WA gagal (${r.wa.alasan ?? "tidak diketahui"})`);
      }
    }
    if (r.push) {
      if (r.push.terkirim > 0) bagian.push(`notifikasi app terkirim`);
      else if (r.push.tujuan === 0) bagian.push("peminta belum menyalakan notifikasi app");
      else {
        gagal = true;
        bagian.push("notifikasi app gagal");
      }
    } else if (status === "DIBELI" || status === "DITOLAK" || status === "DIPERTIMBANGKAN") {
      bagian.push("peminta tidak punya akun app, jadi hanya WA");
    }
    setPesan({ ok: !gagal, t: `${bagian.join(" · ")} ${gagal ? "⚠️" : "✅"}` });
    router.refresh();
  }

  async function hapus(u: Usulan) {
    if (!confirm(`Hapus usulan "${u.title}"? Tidak bisa dibatalkan.`)) return;
    setSibuk(u.id);
    setPesan(null);
    const r = await api("/api/admin/requests?id=" + encodeURIComponent(u.id), "DELETE");
    setSibuk("");
    if (!r.ok) return setPesan({ ok: false, t: r.error ?? "Gagal menghapus." });
    setRows((l) => l.filter((x) => x.id !== u.id));
    setPesan({ ok: true, t: `Usulan "${u.title}" dihapus.` });
    router.refresh();
  }

  if (rows.length === 0) return <div className="card muted">Belum ada usulan buku.</div>;

  return (
    <>
      {pesan && (
        <div className={pesan.ok ? "ok" : "err"} role="status" style={{ marginBottom: 10 }}>
          {pesan.t}
        </div>
      )}
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
              <button
                className="btn sm ghost"
                disabled={sibuk === u.id}
                onClick={() => hapus(u)}
                data-testid="hapus-usulan"
                style={{ marginLeft: "auto", color: "var(--red, #d33)" }}
              >
                Hapus
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
