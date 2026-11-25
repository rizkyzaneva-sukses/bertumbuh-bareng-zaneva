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

/**
 * Daftar pengguna + kelola: ubah nama, ubah nomor HP (username), ubah peran,
 * reset password, hapus.
 *
 * Sebelumnya "Ubah nama" memakai `prompt()` bawaan browser — di HP prompt itu
 * kecil, tidak bisa dikoreksi dengan enak, dan tidak ada tempat untuk mengubah
 * NOMOR HP sama sekali (padahal nomor = username login). Sekarang diganti form
 * sebaris yang jelas.
 */
export function UserList({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const shown = users.filter((u) => `${u.name} ${u.display} ${u.phone}`.toLowerCase().includes(q.toLowerCase()));

  async function run(p: Promise<{ ok: boolean; error?: string; code?: string }>, okMsg = "") {
    setErr(""); setNote("");
    const r = await p;
    if (!r.ok) return setErr(r.error ?? "Gagal");
    if (okMsg) setNote(okMsg);
    router.refresh();
  }

  return (
    <>
      <div className="field"><input type="search" placeholder="Cari nama atau nomor…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {err && <div className="err" role="alert" data-testid="user-err">{err}</div>}
      {note && <div className="ok" role="status" data-testid="user-note">{note}</div>}
      <div className="card table-scroll" style={{ padding: 8 }}>
        <table data-testid="user-table">
          <thead><tr><th>Nama</th><th>HP (username)</th><th>Password sementara</th><th></th></tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} data-testid="user-row">
                {editing === u.id ? (
                  <td colSpan={4} style={{ padding: 10 }}>
                    <EditUser
                      user={u}
                      busy={busy === u.id}
                      onCancel={() => setEditing(null)}
                      onSave={async (body) => {
                        setBusy(u.id);
                        setErr(""); setNote("");
                        const r = await api<{ user: { name: string; phone: string } }>(`/api/admin/users/${u.id}`, "PATCH", body);
                        setBusy(null);
                        if (!r.ok) { setErr(r.error ?? "Gagal menyimpan"); return false; }
                        setEditing(null);
                        setNote(`Data ${r.user?.name || u.display} tersimpan.`);
                        router.refresh();
                        return true;
                      }}
                    />
                  </td>
                ) : (
                  <>
                    <td>
                      <b>{u.name || <span className="muted">(belum diisi)</span>}</b>
                      <div>{u.role === "ADMIN" ? <span className="chip accent">Admin</span> : null}</div>
                    </td>
                    <td>{u.display}</td>
                    <td>
                      {u.tempPassword ? <code className="pw" data-testid="temp-pw">{u.tempPassword}</code> : <span className="muted small">{u.mustChangePassword ? "—" : "sudah diganti"}</span>}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                        <button className="btn sm ghost" onClick={() => { setEditing(u.id); setErr(""); setNote(""); }} data-testid="edit-user">Edit</button>
                        <button className="btn sm ghost" onClick={() => { const pw = prompt(`Reset password ${u.name || u.display}. Kosongkan untuk pakai password default.`, ""); if (pw !== null) run(api(`/api/admin/users/${u.id}/reset-password`, "POST", pw ? { password: pw } : {}), `Password ${u.name || u.display} direset. Wajib ganti saat login.`); }} data-testid="reset-pw">Reset</button>
                        {!u.protectedUser && !u.isSelf && (
                          <button className="btn sm ghost" onClick={() => run(api(`/api/admin/users/${u.id}`, "PATCH", { role: u.role === "ADMIN" ? "MEMBER" : "ADMIN" }), `${u.name || u.display} sekarang ${u.role === "ADMIN" ? "Anggota" : "Admin"}.`)}>{u.role === "ADMIN" ? "Cabut admin" : "Jadikan admin"}</button>
                        )}
                        {!u.protectedUser && !u.isSelf && (
                          <button className="btn sm danger" onClick={() => { if (confirm(`Hapus ${u.name || u.display} (${u.display})?\n\nRiwayat pinjam & progres bacanya ikut terhapus dan tidak bisa dibatalkan.`)) run(api(`/api/admin/users/${u.id}`, "DELETE"), `${u.name || u.display} dihapus.`); }} data-testid="delete-user">Hapus</button>
                        )}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="muted" style={{ padding: 8 }}>Tidak ada pengguna yang cocok.</p>}
      </div>
    </>
  );
}

/** Form edit sebaris: nama, nomor HP, peran. */
function EditUser({
  user,
  busy,
  onCancel,
  onSave,
}: {
  user: AdminUser;
  busy: boolean;
  onCancel: () => void;
  onSave: (body: { name?: string; phone?: string; role?: "ADMIN" | "MEMBER" }) => Promise<boolean>;
}) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.display);
  const [role, setRole] = useState<"ADMIN" | "MEMBER">(user.role);

  const nameBerubah = name.trim() !== user.name.trim();
  const phoneBerubah = phone.trim() !== user.display.trim();
  const roleBerubah = role !== user.role;
  const adaPerubahan = nameBerubah || phoneBerubah || roleBerubah;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!adaPerubahan) return onCancel();
    const body: { name?: string; phone?: string; role?: "ADMIN" | "MEMBER" } = {};
    if (nameBerubah) body.name = name.trim();
    if (phoneBerubah) body.phone = phone.trim();
    if (roleBerubah) body.role = role;
    await onSave(body);
  }

  return (
    <form onSubmit={submit} data-testid="edit-user-form">
      <div className="field">
        <label htmlFor={`en-${user.id}`}>Nama</label>
        <input id={`en-${user.id}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap" data-testid="edit-user-name" />
      </div>
      <div className="field">
        <label htmlFor={`ep-${user.id}`}>Nomor HP (jadi username login)</label>
        <input
          id={`ep-${user.id}`}
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={user.protectedUser}
          data-testid="edit-user-phone"
        />
        <p className="muted small" style={{ margin: "4px 0 0" }}>
          {user.protectedUser
            ? "Nomor admin utama dikunci — proteksi akun ini dicek dari nomor HP-nya."
            : "Boleh 08xx, 62xx, atau +62. Orangnya login pakai nomor ini."}
        </p>
      </div>
      <div className="field">
        <label htmlFor={`er-${user.id}`}>Peran</label>
        <select
          id={`er-${user.id}`}
          value={role}
          onChange={(e) => setRole(e.target.value as "ADMIN" | "MEMBER")}
          disabled={user.isSelf || user.protectedUser}
          data-testid="edit-user-role"
        >
          <option value="MEMBER">Anggota — hanya pinjam &amp; baca</option>
          <option value="ADMIN">Admin — kelola buku, anggota, pinjaman</option>
        </select>
        {user.isSelf && <p className="muted small" style={{ margin: "4px 0 0" }}>Ini akunmu sendiri — peran tidak bisa diturunkan.</p>}
      </div>
      <div className="row">
        <button className="btn sm" type="submit" disabled={busy || !adaPerubahan} data-testid="edit-user-save">
          {busy ? "Menyimpan…" : "Simpan"}
        </button>
        <button className="btn sm ghost" type="button" onClick={onCancel} disabled={busy}>Batal</button>
      </div>
    </form>
  );
}
