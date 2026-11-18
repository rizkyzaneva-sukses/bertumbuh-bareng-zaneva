"use client";
import { useState } from "react";
import { api } from "./api";

export function LoginForm() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const r = await api("/api/auth/login", "POST", { phone, password });
    if (!r.ok) {
      setBusy(false);
      return setErr(r.error ?? "Gagal masuk");
    }
    window.location.href = "/";
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="phone">Nomor HP</label>
        <input id="phone" name="phone" inputMode="tel" autoComplete="username" placeholder="08xxxxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      <button className="btn block" disabled={busy} type="submit">{busy ? "Masuk…" : "Masuk"}</button>
    </form>
  );
}
