"use client";
import { useState } from "react";
import { api } from "./api";

/**
 * Popup yang tidak bisa ditutup, muncul di semua halaman selama profil belum lengkap
 * (nama masih kosong dan/atau masih pakai password sementara).
 * Sekali submit = Nama + Password baru tersimpan bersamaan.
 */
export function OnboardingModal({ name, needsName }: { name: string; needsName: boolean }) {
  const [nm, setNm] = useState(needsName ? "" : name);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const sapaan = needsName ? "Selamat datang" : `Halo ${name}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (needsName && nm.trim().length < 2) return setErr("Nama minimal 2 karakter.");
    if (pw.length < 8) return setErr("Password baru minimal 8 karakter.");
    if (pw !== pw2) return setErr("Konfirmasi password belum sama.");
    setBusy(true);
    const body: Record<string, unknown> = { newPassword: pw };
    if (needsName) body.name = nm.trim();
    const r = await api("/api/auth/change-password", "POST", body);
    if (!r.ok) {
      setBusy(false);
      return setErr(r.error ?? "Gagal menyimpan");
    }
    window.location.reload();
  }

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="fpw-title" data-testid="force-password-modal">
      <form className="modal" onSubmit={submit}>
        <h2 id="fpw-title">{needsName ? "Lengkapi profil dulu ya 👋" : "Ganti password dulu ya 🔐"}</h2>
        <p className="muted small">
          {sapaan}! {needsName ? "Isi namamu dan buat password sendiri" : "Kamu masih pakai password sementara, buat password baru"} supaya akunmu aman.
          Setelah ini baru bisa lanjut.
        </p>
        {needsName && (
          <div className="field">
            <label htmlFor="on-name">Nama lengkap</label>
            <input id="on-name" name="name" autoComplete="name" value={nm} onChange={(e) => setNm(e.target.value)} placeholder="Contoh: Sinta Dewi" data-testid="onboarding-name" />
          </div>
        )}
        <div className="field">
          <label htmlFor="np1">Password baru</label>
          <input id="np1" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Minimal 8 karakter" data-testid="onboarding-password" />
        </div>
        <div className="field">
          <label htmlFor="np2">Ulangi password baru</label>
          <input id="np2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        {err && <div className="err" role="alert">{err}</div>}
        <button className="btn block" disabled={busy} type="submit">{busy ? "Menyimpan…" : needsName ? "Simpan nama & password" : "Simpan password baru"}</button>
        <button type="button" className="btn ghost block" style={{ marginTop: 8 }} onClick={async () => { await api("/api/auth/logout"); window.location.href = "/login"; }}>Keluar dulu</button>
      </form>
    </div>
  );
}
