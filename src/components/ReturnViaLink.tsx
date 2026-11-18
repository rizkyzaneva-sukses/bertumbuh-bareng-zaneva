"use client";
import { useState } from "react";
import { api } from "./api";

export function ReturnViaLink({ token, title }: { token: string; title: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState("");
  async function go() {
    setState("busy");
    const r = await api(`/api/return/${token}`);
    if (!r.ok) {
      setErr(r.error ?? "Gagal");
      return setState("idle");
    }
    setState("done");
  }
  if (state === "done")
    return <div className="ok" role="status" data-testid="return-done">Terima kasih! “{title}” sudah tercatat dikembalikan 🎉</div>;
  return (
    <>
      {err && <div className="err" role="alert">{err}</div>}
      <button className="btn block" onClick={go} disabled={state === "busy"} data-testid="return-now">{state === "busy" ? "Memproses…" : "Balikin sekarang"}</button>
    </>
  );
}
