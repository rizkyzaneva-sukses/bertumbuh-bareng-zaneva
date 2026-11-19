"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { CONDITIONS, CONDITION_HINT, CONDITION_LABEL, type Condition } from "@/lib/conditions";

export function BorrowButton({ bookId, title, disabled, label = "Pinjam" }: { bookId: string; title: string; disabled?: boolean; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go() {
    if (!confirm(`Pinjam "${title}"? Lama pinjam 3 hari kerja (Ahad tidak dihitung).`)) return;
    setBusy(true);
    setMsg(null);
    const r = await api<{ loan?: { dueDate: string } }>("/api/loans", "POST", { bookId });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Gagal meminjam" });
    setMsg({ ok: true, text: "Berhasil dipinjam! 🎉" });
    router.refresh();
  }
  return (
    <div>
      <button className="btn sm" disabled={disabled || busy} onClick={go} data-testid="borrow">{busy ? "…" : label}</button>
      {msg && <div className={msg.ok ? "ok" : "err"} role="status">{msg.text}</div>}
    </div>
  );
}

export function ReturnLoanButton({ loanId, title, admin = false }: { loanId: string; title: string; admin?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [condition, setCondition] = useState<Condition>("BAIK");
  const [note, setNote] = useState("");

  async function go(cond: Condition = "BAIK", catatan = "") {
    const pesan =
      cond === "HILANG"
        ? `Tandai "${title}" HILANG? Stok buku ini akan berkurang 1.`
        : cond === "BAIK"
          ? admin ? `Tandai "${title}" sudah dikembalikan?` : `Balikin "${title}" sekarang?`
          : `Tandai "${title}" kembali dengan kondisi ${CONDITION_LABEL[cond]}?`;
    if (!confirm(pesan)) return;
    setBusy(true);
    setErr("");
    const r = await api(`/api/loans/${loanId}/return`, "POST", { condition: cond, note: catatan });
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "Gagal");
    setOpen(false);
    router.refresh();
  }

  // Peminjam: satu tombol saja, selalu dianggap kondisi baik.
  if (!admin) {
    return (
      <div>
        <button className="btn sm soft" disabled={busy} onClick={() => go("BAIK")} data-testid="return">
          {busy ? "…" : "Balikin"}
        </button>
        {err && <div className="err">{err}</div>}
      </div>
    );
  }

  return (
    <div>
      {!open ? (
        <button className="btn sm soft" disabled={busy} onClick={() => setOpen(true)} data-testid="return">
          Tandai dikembalikan
        </button>
      ) : (
        <div data-testid="return-condition">
          <div className="field" style={{ marginBottom: 6 }}>
            <label htmlFor={`cond-${loanId}`}>Kondisi buku</label>
            <select id={`cond-${loanId}`} value={condition} onChange={(e) => setCondition(e.target.value as Condition)} data-testid="condition-select">
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>{CONDITION_LABEL[c]} — {CONDITION_HINT[c]}</option>
              ))}
            </select>
          </div>
          {condition !== "BAIK" && (
            <div className="field" style={{ marginBottom: 6 }}>
              <label htmlFor={`note-${loanId}`}>Catatan (opsional)</label>
              <input id={`note-${loanId}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. halaman 12 sobek" maxLength={300} />
            </div>
          )}
          <div className="row">
            <button className="btn sm soft" disabled={busy} onClick={() => go(condition, note)} data-testid="confirm-return">
              {busy ? "…" : "Konfirmasi"}
            </button>
            <button className="btn sm ghost" disabled={busy} onClick={() => { setOpen(false); setNote(""); setCondition("BAIK"); }}>Batal</button>
          </div>
        </div>
      )}
      {err && <div className="err">{err}</div>}
    </div>
  );
}
