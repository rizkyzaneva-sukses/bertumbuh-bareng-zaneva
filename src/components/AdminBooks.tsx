"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { BookCover } from "./BookCover";

export type BookIssues = { ringan: number; berat: number; hilang: number };
export type AdminBook = {
  id: string;
  title: string;
  author: string;
  pages: number | null;
  category: string;
  synopsis: string;
  stock: number;
  active: number;
  coverUrl: string;
  issues?: BookIssues;
  /** Terisi = buku sedang diarsipkan (tidak di rak, tidak bisa dipinjam). */
  archivedAt?: string | null;
};

/** Kategori baku — sengaja daftar tetap supaya rak tidak pecah jadi puluhan label. */
import { CATEGORIES } from "@/lib/categories";
export { CATEGORIES };

const MAX_COVER_MB = 2;

/**
 * Unggah sampul. Dipisah dari POST/PATCH buku supaya:
 *  - buku baru: simpan dulu (dapat id), baru unggah;
 *  - buku lama: unggah langsung, tidak perlu "Simpan perubahan".
 */
function CoverPicker({ bookId, title, author, category, coverUrl, onChanged }: {
  bookId?: string;
  title: string;
  author: string;
  category: string;
  coverUrl: string;
  onChanged: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function upload(file: File) {
    if (!bookId) return;
    setErr("");
    if (file.size > MAX_COVER_MB * 1024 * 1024) return setErr(`Ukuran maksimal ${MAX_COVER_MB} MB`);
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/books/${bookId}/cover`, { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(body.error ?? "Gagal mengunggah sampul");
    onChanged(body.coverUrl ?? "");
  }

  async function remove() {
    if (!bookId) return;
    if (!confirm("Hapus sampul? Buku kembali memakai sampul otomatis.")) return;
    setBusy(true);
    const res = await fetch(`/api/books/${bookId}/cover`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setErr("Gagal menghapus sampul");
    onChanged("");
  }

  return (
    <div className="field">
      <label>Sampul buku</label>
      <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 76, flex: "none" }}>
          <BookCover book={{ id: bookId ?? "baru", title: title || "Judul buku", author: author || "Penulis", category, coverUrl }} size="sm" />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <p className="small muted" style={{ marginTop: 0 }}>
            Kosongkan untuk sampul otomatis (warna kategori). Unggah foto sampul asli supaya rak makin mirip toko buku.
          </p>
          {bookId ? (
            <div className="row">
              <button type="button" className="btn sm ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? "Mengunggah…" : coverUrl ? "Ganti gambar" : "Unggah gambar"}
              </button>
              {coverUrl && (
                <button type="button" className="btn sm ghost" disabled={busy} onClick={remove} data-testid="cover-remove">
                  Hapus
                </button>
              )}
            </div>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>Simpan buku dulu, lalu unggah sampulnya di daftar.</p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            data-testid="cover-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          {err && <div className="err" role="alert">{err}</div>}
        </div>
      </div>
    </div>
  );
}

function BookForm({ initial, onDone, onCancel }: { initial?: AdminBook; onDone: () => void; onCancel?: () => void }) {
  const [f, setF] = useState({
    title: initial?.title ?? "", author: initial?.author ?? "", pages: initial?.pages?.toString() ?? "",
    category: initial?.category ?? "", synopsis: initial?.synopsis ?? "", stock: String(initial?.stock ?? 1),
  });
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const body = { title: f.title, author: f.author, pages: f.pages.trim() ? Number(f.pages) : null, category: f.category, synopsis: f.synopsis, stock: Number(f.stock || 1), coverUrl };
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
      <div className="field">
        <label>Kategori</label>
        <select value={f.category} onChange={set("category")} name="category">
          <option value="">— pilih kategori —</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="field"><label>Sinopsis / bahasan buku</label><textarea value={f.synopsis} onChange={set("synopsis")} name="synopsis" /></div>
      <CoverPicker
        bookId={initial?.id}
        title={f.title}
        author={f.author}
        category={f.category}
        coverUrl={coverUrl}
        onChanged={setCoverUrl}
      />
      <div className="field">
        <label>Atau tempel URL gambar sampul</label>
        <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://… (kosongkan untuk sampul otomatis)" name="coverUrl" />
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      <div className="row">
        <button className="btn" disabled={busy} type="submit">{busy ? "Menyimpan…" : initial ? "Simpan perubahan" : "Tambah buku"}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Batal</button>}
      </div>
    </form>
  );
}

export function AdminBooks({ books, archived = [], totalIssues = 0 }: { books: AdminBook[]; archived?: AdminBook[]; totalIssues?: number }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // Tab "rak" (default) vs "arsip". Dipisah supaya buku yang disimpan tidak
  // tercampur dengan koleksi aktif — dan supaya jumlah arsip terlihat jelas.
  const [tab, setTab] = useState<"rak" | "arsip">("rak");
  const list = tab === "rak" ? books : archived;
  const shown = list.filter((b) => `${b.title} ${b.author}`.toLowerCase().includes(q.toLowerCase()));
  const bermasalah = books.filter((b) => b.issues && (b.issues.ringan + b.issues.berat + b.issues.hilang) > 0);
  const tanpaSampul = books.filter((b) => !b.coverUrl).length;

  async function del(b: AdminBook) {
    if (!confirm(`Hapus "${b.title}" PERMANEN?\n\nSampul, riwayat pinjam, dan progres baca buku ini ikut terhapus dan tidak bisa dibatalkan.\n\nKalau hanya ingin menyimpan bukunya, pakai "Arsipkan" — datanya tetap utuh.`)) return;
    setErr("");
    const r = await api(`/api/books/${b.id}`, "DELETE");
    if (!r.ok) return setErr(r.error ?? "Gagal menghapus");
    router.refresh();
  }

  /** Arsipkan (simpan) atau kembalikan ke rak. Tidak menghapus apa pun. */
  async function arsip(b: AdminBook, archived: boolean) {
    const pesan = archived
      ? `Arsipkan "${b.title}"?\n\nBuku hilang dari rak dan tidak bisa dipinjam lagi. Sampul, riwayat pinjam, dan progres baca tetap tersimpan, dan bisa dikembalikan ke rak kapan saja.` +
        (b.active > 0 ? `\n\nCatatan: ${b.active} pinjaman masih berjalan — tetap bisa dikembalikan seperti biasa.` : "")
      : `Kembalikan "${b.title}" ke rak?\n\nBuku muncul lagi di rak dan bisa dipinjam anggota.`;
    if (!confirm(pesan)) return;
    setErr("");
    setNote("");
    setBusy(b.id);
    const r = await api<{ pesan?: string }>(`/api/books/${b.id}/archive`, "POST", { archived });
    setBusy(null);
    if (!r.ok) return setErr(r.error ?? "Gagal mengarsipkan");
    setNote(r.pesan ?? (archived ? "Buku diarsipkan." : "Buku kembali ke rak."));
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
      {note && <div className="ok" role="status" data-testid="arsip-note">{note}</div>}
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "rak"}
          className={tab === "rak" ? "on" : ""}
          onClick={() => { setTab("rak"); setEditing(null); }}
          data-testid="tab-rak"
        >
          📚 Di rak ({books.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "arsip"}
          className={tab === "arsip" ? "on" : ""}
          onClick={() => { setTab("arsip"); setEditing(null); }}
          data-testid="tab-arsip"
        >
          🗄️ Arsip ({archived.length})
        </button>
      </div>
      {tab === "arsip" && (
        <div className="card" style={{ borderLeft: "4px solid #64748b" }}>
          <h2 style={{ marginTop: 0 }}>Buku yang disimpan</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Buku di sini <b>tidak</b> muncul di rak dan tidak bisa dipinjam, tapi sampul, riwayat pinjam, dan progres baca tetap utuh.
            Tekan <b>Kembalikan ke rak</b> kalau mau dipinjamkan lagi.
          </p>
        </div>
      )}
      {totalIssues > 0 && tab === "rak" && (
        <div className="card" data-testid="damage-summary" style={{ borderLeft: "4px solid #d97706" }}>
          <h2 style={{ marginTop: 0 }}>Buku bermasalah ({bermasalah.length} judul)</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Tercatat dari pengembalian: {totalIssues} kejadian. Buku hilang sudah otomatis mengurangi stok.
          </p>
          <ul className="list">
            {bermasalah.map((b) => (
              <li key={b.id} data-testid="damaged-book">
                <span style={{ flex: 1 }}>{b.title}</span>
                {!!b.issues!.ringan && <span className="chip amber">{b.issues!.ringan} ringan</span>}
                {!!b.issues!.berat && <span className="chip red">{b.issues!.berat} berat</span>}
                {!!b.issues!.hilang && <span className="chip red">{b.issues!.hilang} hilang</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted small">
        {shown.length} dari {list.length} judul · {tab === "rak"
          ? tanpaSampul > 0 ? `${tanpaSampul} masih pakai sampul otomatis` : "semua judul sudah punya gambar sampul"
          : `${archived.length} buku disimpan, datanya utuh`}
      </p>
      {shown.length === 0 && (
        <p className="muted">
          {tab === "arsip" ? "Belum ada buku yang diarsipkan." : "Tidak ada buku yang cocok."}
        </p>
      )}
      {shown.map((b) => (
        <div className="card" key={b.id} data-testid={tab === "arsip" ? "archived-book" : "admin-book"}>
          {editing === b.id ? (
            <BookForm initial={b} onDone={() => { setEditing(null); router.refresh(); }} onCancel={() => setEditing(null)} />
          ) : (
            <>
              <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 12 }}>
                <div style={{ width: 56, flex: "none" }}>
                  <BookCover book={b} size="xs" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 style={{ margin: 0 }}>{b.title}</h3>
                  <div className="small muted">
                    {b.author} · {b.pages ? `${b.pages} hlm` : "halaman belum diisi"} · stok {b.stock}{b.active ? ` (${b.active} dipinjam)` : ""}
                  </div>
                  {b.archivedAt && (
                    <div className="meta" style={{ marginTop: 4 }}>
                      <span className="chip" data-testid="chip-arsip">🗄️ diarsipkan</span>
                      {b.active > 0 && <span className="chip amber">{b.active} pinjaman masih berjalan</span>}
                    </div>
                  )}
                  {b.issues && (b.issues.ringan + b.issues.berat + b.issues.hilang) > 0 && (
                    <div className="meta" style={{ marginTop: 4 }}>
                      {!!b.issues.ringan && <span className="chip amber">{b.issues.ringan}× rusak ringan</span>}
                      {!!b.issues.berat && <span className="chip red">{b.issues.berat}× rusak berat</span>}
                      {!!b.issues.hilang && <span className="chip red">{b.issues.hilang}× hilang</span>}
                    </div>
                  )}
                </div>
                {b.category && <span className="chip">{b.category}</span>}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                {b.archivedAt ? (
                  <button
                    className="btn sm"
                    disabled={busy === b.id}
                    onClick={() => arsip(b, false)}
                    data-testid="unarchive-book"
                  >
                    {busy === b.id ? "Memproses…" : "Kembalikan ke rak"}
                  </button>
                ) : (
                  <>
                    <button className="btn sm ghost" onClick={() => setEditing(b.id)}>Edit</button>
                    <button
                      className="btn sm ghost"
                      disabled={busy === b.id}
                      onClick={() => arsip(b, true)}
                      data-testid="archive-book"
                    >
                      {busy === b.id ? "Memproses…" : "Arsipkan"}
                    </button>
                    <button className="btn sm danger" onClick={() => del(b)} data-testid="delete-book">Hapus</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      ))}
    </>
  );
}
