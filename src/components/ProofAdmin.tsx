"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { ukuranRingkas } from "@/lib/proof-image";

/**
 * Bukti pengembalian dari sisi admin.
 *
 * Admin yang menerima buku di meja juga bisa memotret — bukan cuma peminjam.
 * Foto tidak jelas / salah kirim bisa dihapus, dan menghapus bukti TIDAK
 * mengubah status kembali bukunya (itu sebabnya bukti disimpan terpisah).
 */
export function ProofAdmin({ loanId, adaBukti, ukuran }: { loanId: string; adaBukti: boolean; ukuran: number | null }) {
  const router = useRouter();
  const [sibuk, setSibuk] = useState(false);
  const [err, setErr] = useState("");

  async function hapus() {
    if (!confirm("Hapus foto bukti ini? Status buku tetap tercatat sudah dikembalikan.")) return;
    setSibuk(true);
    setErr("");
    const r = await api(`/api/loans/${loanId}/proof`, "DELETE");
    setSibuk(false);
    if (!r.ok) return setErr(r.error ?? "Gagal menghapus.");
    router.refresh();
  }

  if (!adaBukti) {
    return <span className="small muted" data-testid="proof-kosong">Tanpa foto bukti</span>;
  }

  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }} data-testid="proof-admin">
      <a
        className="btn sm ghost"
        href={`/api/loans/${loanId}/proof`}
        target="_blank"
        rel="noreferrer"
        data-testid="proof-buka"
      >
        📷 Lihat bukti
      </a>
      {ukuran ? <span className="small muted">{ukuranRingkas(ukuran)}</span> : null}
      <button className="btn sm ghost" disabled={sibuk} onClick={hapus} data-testid="proof-hapus" style={{ color: "var(--red, #d33)" }}>
        {sibuk ? "…" : "Hapus"}
      </button>
      {err && <span className="err small">{err}</span>}
    </div>
  );
}
