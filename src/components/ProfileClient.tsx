"use client";
import { useState } from "react";
import { api } from "./api";

export function ChangePasswordForm() {
  const [o, setO] = useState("");
  const [n, setN] = useState("");
  const [n2, setN2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (n !== n2) return setMsg({ ok: false, t: "Konfirmasi password belum sama." });
    const r = await api("/api/auth/change-password", "POST", { oldPassword: o, newPassword: n });
    if (!r.ok) return setMsg({ ok: false, t: r.error ?? "Gagal" });
    setMsg({ ok: true, t: "Password berhasil diganti." });
    setO(""); setN(""); setN2("");
  }
  return (
    <form onSubmit={submit}>
      <div className="field"><label htmlFor="po">Password lama</label><input id="po" type="password" autoComplete="current-password" value={o} onChange={(e) => setO(e.target.value)} /></div>
      <div className="field"><label htmlFor="pn">Password baru</label><input id="pn" type="password" autoComplete="new-password" value={n} onChange={(e) => setN(e.target.value)} /></div>
      <div className="field"><label htmlFor="pn2">Ulangi password baru</label><input id="pn2" type="password" autoComplete="new-password" value={n2} onChange={(e) => setN2(e.target.value)} /></div>
      {msg && <div className={msg.ok ? "ok" : "err"} role="status">{msg.t}</div>}
      <button className="btn" type="submit">Ganti password</button>
    </form>
  );
}

export function LogoutButton() {
  return (
    <button className="btn ghost" onClick={async () => { await api("/api/auth/logout"); window.location.href = "/login"; }}>Keluar</button>
  );
}
