"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";

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
  async function go() {
    if (!confirm(admin ? `Tandai "${title}" sudah dikembalikan?` : `Balikin "${title}" sekarang?`)) return;
    setBusy(true);
    const r = await api(`/api/loans/${loanId}/return`);
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "Gagal");
    router.refresh();
  }
  return (
    <div>
      <button className="btn sm soft" disabled={busy} onClick={go} data-testid="return">{busy ? "…" : admin ? "Tandai dikembalikan" : "Balikin"}</button>
      {err && <div className="err">{err}</div>}
    </div>
  );
}
