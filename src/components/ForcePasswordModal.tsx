"use client";
import { useState } from "react";
import { api } from "./api";

/** Popup yang tidak bisa ditutup, muncul di semua halaman selama mustChangePassword = true. */
export function ForcePasswordModal({ name }: { name: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (pw.length < 8) return setErr("Password baru minimal 8 karakter.");
    if (pw !== pw2) return setErr("Konfirmasi password belum sama.");
    setBusy(true);
    const r = await api("/api/auth/change-password", "POST", { newPassword: pw });
    if (!r.ok) {
      setBusy(false);
      return setErr(r.error ?? "Gagal ganti password");
    }
    window.location.reload();
  }

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="fpw-title" data-testid="force-password-modal">
      <form className="modal" onSubmit={submit}>
        <h2 id="fpw-title">Ganti password dulu ya 🔐</h2>
        <p className="muted small">Halo {name}! Kamu masih pakai password sementara. Buat password baru supaya akunmu aman. Setelah ini baru bisa lanjut.</p>
        <div className="field">
          <label htmlFor="np1">Password baru</label>
          <input id="np1" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Minimal 8 karakter" />
        </div>
        <div className="field">
          <label htmlFor="np2">Ulangi password baru</label>
          <input id="np2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        {err && <div className="err" role="alert">{err}</div>}
        <button className="btn block" disabled={busy} type="submit">{busy ? "Menyimpan…" : "Simpan password baru"}</button>
        <button type="button" className="btn ghost block" style={{ marginTop: 8 }} onClick={async () => { await api("/api/auth/logout"); window.location.href = "/login"; }}>Keluar dulu</button>
      </form>
    </div>
  );
}
