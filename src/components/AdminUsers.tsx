"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";

export type AdminUser = { id: string; name: string; phone: string; display: string; role: "ADMIN" | "MEMBER"; mustChangePassword: boolean; tempPassword: string | null; protectedUser: boolean; isSelf: boolean };

type BulkResult = { created: number; skipped: { name: string; phone: string; reason: string }[]; errors: { line: number; text: string; reason: string }[] };
type InviteResult = { user: { id: string; name: string; phone: string; role: "ADMIN" | "MEMBER" }; tempPassword: string; needsName: boolean; invite: string };

/** Tambah satu orang — anggota atau admin. Nama boleh dikosongkan agar diisi sendiri saat login pertama. */
export function AddUser() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setRes(null); setCopied(false); setBusy(true);
    const r = await api<InviteResult>("/api/admin/users/invite", "POST", {
      phone, role, name: name.trim() || undefined, password: pw.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "Gagal menambah pengguna");
    setRes(r);
    setPhone(""); setName(""); setPw("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card" data-testid="add-user-form">
      <h2>Tambah pengguna</h2>
      <p className="muted small">Satu orang. Kosongkan <b>Nama</b> kalau mau orangnya mengisi sendiri saat login pertama (dia tetap wajib isi Nama + Password baru).</p>
      <div className="field">
        <label htmlFor="add-phone">Nomor HP (jadi username)</label>
        <input id="add-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62 851-7755-5437" data-testid="add-user-phone" />
      </div>
      <div className="field">
        <label htmlFor="add-name">Nama (opsional)</label>
        <input id="add-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kosong = diisi sendiri oleh orangnya" data-testid="add-user-name" />
      </div>
      <div className="field">
        <label htmlFor="add-role">Peran</label>
        <select id="add-role" value={role} onChange={(e) => setRole(e.target.value as "MEMBER" | "ADMIN")} data-testid="add-user-role">
          <option value="MEMBER">Anggota — hanya pinjam &amp; baca</option>
          <option value="ADMIN">Admin — kelola buku, anggota, pinjaman</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="add-pw">Password sementara (opsional)</label>
        <input id="add-pw" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Kosong = pakai password default dari server" />
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      {res && (
        <div className="ok" role="status" data-testid="add-user-result">
          <b>{res.user.role === "ADMIN" ? "Admin" : "Anggota"} dibuat</b> — {res.user.phone}
          {res.needsName ? " (nama menyusul, diisi sendiri olehnya)" : ` (${res.user.name})`}
          <div style={{ marginTop: 6 }}>Password sementara: <code className="pw">{res.tempPassword}</code></div>
          <textarea readOnly value={res.invite} rows={5} style={{ marginTop: 8, width: "100%" }} aria-label="Teks undangan WhatsApp" />
          <button type="button" className="btn sm ghost" style={{ marginTop: 6 }} onClick={async () => { try { await navigator.clipboard.writeText(res.invite); setCopied(true); } catch { setCopied(false); } }}>
            {copied ? "Tersalin ✓" : "Salin teks undangan"}
          </button>
        </div>
      )}
      <button className="btn" disabled={busy || !phone.trim()} type="submit">{busy ? "Menyimpan…" : "Tambah pengguna"}</button>
    </form>
  );
}

export function BulkAdd() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<BulkResult | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setText(await f.text());
    e.target.value = "";
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setRes(null);
    setBusy(true);
    const r = await api<BulkResult>("/api/admin/users", "POST", { text, password: pw || undefined });
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "Gagal");
    setRes(r);
    setText("");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="card" data-testid="bulk-form">
      <h2>Daftarkan anggota sekaligus</h2>
      <p className="muted small">Tempel daftar (satu orang per baris: <code className="pw">Nama, 0812xxxx</code>) atau unggah file CSV. Nomor 08xx / 62xx / +62 otomatis dirapikan.</p>
      <div className="field"><textarea name="list" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Sinta Dewi, 081234567890\nBudi, +62 857-1111-2222"} /></div>
      <div className="field"><input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} aria-label="Unggah CSV" /></div>
      <div className="field">
        <label htmlFor="bulkpw">Password sementara (opsional)</label>
        <input id="bulkpw" name="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Kosong = pakai password default dari server" />
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      {res && (
        <div className="ok" role="status" data-testid="bulk-result">
          {res.created} akun dibuat.
          {res.skipped.length > 0 && <div>Dilewati: {res.skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}</div>}
          {res.errors.length > 0 && <div>Baris bermasalah: {res.errors.map((s) => `#${s.line} ${s.reason}`).join("; ")}</div>}
        </div>
      )}
      <button className="btn" disabled={busy || !text.trim()} type="submit">{busy ? "Memproses…" : "Daftarkan"}</button>
    </form>
  );
}

export function UserList({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const shown = users.filter((u) => `${u.name} ${u.display}`.toLowerCase().includes(q.toLowerCase()));

  async function run(p: Promise<{ ok: boolean; error?: string }>, okMsg = "") {
    setErr(""); setNote("");
    const r = await p;
    if (!r.ok) return setErr(r.error ?? "Gagal");
    if (okMsg) setNote(okMsg);
    router.refresh();
  }

  return (
    <>
      <div className="field"><input type="search" placeholder="Cari nama atau nomor…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {err && <div className="err" role="alert">{err}</div>}
      {note && <div className="ok" role="status">{note}</div>}
      <div className="card table-scroll" style={{ padding: 8 }}>
        <table data-testid="user-table">
          <thead><tr><th>Nama</th><th>HP (username)</th><th>Password sementara</th><th></th></tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} data-testid="user-row">
                <td>
                  <b>{u.name || <span className="muted">(belum diisi)</span>}</b>
                  <div>{u.role === "ADMIN" ? <span className="chip accent">Admin</span> : null}</div>
                </td>
                <td>{u.display}</td>
                <td>
                  {u.tempPassword ? <code className="pw" data-testid="temp-pw">{u.tempPassword}</code> : <span className="muted small">{u.mustChangePassword ? "—" : "sudah diganti"}</span>}
                </td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn sm ghost" onClick={() => { const pw = prompt(`Reset password ${u.name || u.display}. Kosongkan untuk pakai password default.`, ""); if (pw !== null) run(api(`/api/admin/users/${u.id}/reset-password`, "POST", pw ? { password: pw } : {}), `Password ${u.name || u.display} direset. Wajib ganti saat login.`); }} data-testid="reset-pw">Reset</button>
                    <button className="btn sm ghost" onClick={() => { const n = prompt("Nama baru", u.name); if (n) run(api(`/api/admin/users/${u.id}`, "PATCH", { name: n })); }}>Ubah nama</button>
                    {!u.protectedUser && !u.isSelf && (
                      <button className="btn sm ghost" onClick={() => run(api(`/api/admin/users/${u.id}`, "PATCH", { role: u.role === "ADMIN" ? "MEMBER" : "ADMIN" }))}>{u.role === "ADMIN" ? "Cabut admin" : "Jadikan admin"}</button>
                    )}
                    {!u.protectedUser && !u.isSelf && (
                      <button className="btn sm danger" onClick={() => { if (confirm(`Hapus ${u.name || u.display}? Riwayat bacanya ikut terhapus.`)) run(api(`/api/admin/users/${u.id}`, "DELETE")); }}>Hapus</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
