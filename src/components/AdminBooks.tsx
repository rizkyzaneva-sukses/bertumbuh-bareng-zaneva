"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";

export type AdminBook = { id: string; title: string; author: string; pages: number | null; category: string; synopsis: string; stock: number; active: number };

function BookForm({ initial, onDone, onCancel }: { initial?: AdminBook; onDone: () => void; onCancel?: () => void }) {
  const [f, setF] = useState({
    title: initial?.title ?? "", author: initial?.author ?? "", pages: initial?.pages?.toString() ?? "",
    category: initial?.category ?? "", synopsis: initial?.synopsis ?? "", stock: String(initial?.stock ?? 1),
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const body = { title: f.title, author: f.author, pages: f.pages.trim() ? Number(f.pages) : null, category: f.category, synopsis: f.synopsis, stock: Number(f.stock || 1) };
    const r = initial ? await api(`/api/books/${initial.id}`, "PATCH", body) : await api("/api/books", "POST", body);
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "Gagal menyimpan");
    if (!initial) setF({ title: "", author: "", pages: "", category: "", synopsis: "", stock: "1" });
    onDone();
  }
  return (
    <form onSubmit={submit} data-testid={initial ? "edit-book-form" : "add-book-form"}>
      <div className="field"><label>Judul</label><input value={f.title} onChange={set("title")} name="title" /></div>
      <div className="field"><label>Penulis</label><input value={f.author} onChange={set("author")} name="author" /></div>
      <div className="grid cols2">
        <div className="field"><label>Jumlah halaman</label><input inputMode="numeric" value={f.pages} onChange={set("pages")} name="pages" placeholder="Kosongkan kalau belum tahu" /></div>
        <div className="field"><label>Stok (eksemplar)</label><input inputMode="numeric" value={f.stock} onChange={set("stock")} name="stock" /></div>
      </div>
      <div className="field"><label>Kategori</label><input value={f.category} onChange={set("category")} name="category" /></div>
      <div className="field"><label>Sinopsis / bahasan buku</label><textarea value={f.synopsis} onChange={set("synopsis")} name="synopsis" /></div>
      {err && <div className="err" role="alert">{err}</div>}
      <div className="row">
        <button className="btn" disabled={busy} type="submit">{busy ? "Menyimpan…" : initial ? "Simpan perubahan" : "Tambah buku"}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Batal</button>}
      </div>
    </form>
  );
}

export function AdminBooks({ books }: { books: AdminBook[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const shown = books.filter((b) => `${b.title} ${b.author}`.toLowerCase().includes(q.toLowerCase()));

  async function del(b: AdminBook) {
    if (!confirm(`Hapus "${b.title}"? Riwayat baca buku ini juga ikut terhapus dan tidak bisa dibatalkan.`)) return;
    setErr("");
    const r = await api(`/api/books/${b.id}`, "DELETE");
    if (!r.ok) return setErr(r.error ?? "Gagal menghapus");
    router.refresh();
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <input style={{ flex: 1 }} type="search" placeholder="Cari buku…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => setAdding(!adding)} data-testid="toggle-add-book">{adding ? "Tutup" : "+ Tambah buku"}</button>
      </div>
      {adding && <div className="card"><h2>Buku baru</h2><BookForm onDone={() => { setAdding(false); router.refresh(); }} onCancel={() => setAdding(false)} /></div>}
      {err && <div className="err" role="alert">{err}</div>}
      <p className="muted small">{shown.length} dari {books.length} judul</p>
      {shown.map((b) => (
        <div className="card" key={b.id} data-testid="admin-book">
          {editing === b.id ? (
            <BookForm initial={b} onDone={() => { setEditing(null); router.refresh(); }} onCancel={() => setEditing(null)} />
          ) : (
            <>
              <div className="row between">
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{b.title}</h3>
                  <div className="small muted">{b.author} · {b.pages ? `${b.pages} hlm` : "halaman belum diisi"} · stok {b.stock}{b.active ? ` (${b.active} dipinjam)` : ""}</div>
                </div>
                {b.category && <span className="chip">{b.category}</span>}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn sm ghost" onClick={() => setEditing(b.id)}>Edit</button>
                <button className="btn sm danger" onClick={() => del(b)} data-testid="delete-book">Hapus</button>
              </div>
            </>
          )}
        </div>
      ))}
    </>
  );
}
