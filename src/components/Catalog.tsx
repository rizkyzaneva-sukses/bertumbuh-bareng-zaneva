"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { BorrowButton } from "./LoanActions";
import { BookCover } from "./BookCover";
import { categoriesInUse } from "@/lib/categories";

export type CatalogBook = {
  id: string;
  title: string;
  author: string;
  pages: number | null;
  category: string;
  synopsis: string;
  stock: number;
  available: number;
  mine: boolean;
  coverUrl: string;
  /** Nama orang yang sedang memegang buku ini (kosong kalau tersedia). */
  holders: string[];
};

/**
 * Rak gaya etalase toko buku.
 *
 * Bos: *"Biar bukunya terlihat bagus di app, tambahin cover dong jadi bukan text
 * judul aja. Sistemnya kaya storefront jualan."* — karena itu tiap buku tampil
 * sebagai SAMPUL 2:3 yang besar (bukan baris teks), kategori jadi "lorong" yang
 * bisa disaring, dan tombol pinjam menempel di bawah sampul seperti tombol beli.
 */
export function Catalog({ books, slotsFull, isAdmin }: { books: CatalogBook[]; slotsFull: boolean; isAdmin: boolean }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const cats = useMemo(() => categoriesInUse(books.map((b) => b.category)), [books]);
  const shown = books.filter((b) => {
    const t = `${b.title} ${b.author} ${b.category} ${b.synopsis}`.toLowerCase();
    return (!q || t.includes(q.toLowerCase())) && (!cat || b.category === cat);
  });
  // Lorong hanya dipakai saat tidak sedang mencari & tidak memilih kategori.
  const grouped = !q && !cat;

  return (
    <>
      <div className="field">
        <input
          type="search"
          placeholder="Cari judul, penulis, atau topik…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Cari buku"
          data-testid="search"
        />
      </div>
      <div className="tabs" role="tablist" aria-label="Filter kategori">
        <button type="button" className={cat === "" ? "on" : ""} onClick={() => setCat("")} style={{ cursor: "pointer" }}>
          Semua
        </button>
        {cats.map((c) => (
          <button key={c} type="button" className={cat === c ? "on" : ""} onClick={() => setCat(c === cat ? "" : c)} style={{ cursor: "pointer" }}>
            {c}
          </button>
        ))}
      </div>
      <p className="shelf-hint" data-testid="shelf-hint">
        {shown.length} buku
        {slotsFull ? " · slot pinjammu penuh, balikin dulu satu buku ya" : ""}
      </p>

      {shown.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Tidak ada buku yang cocok. Coba kata kunci lain atau <button type="button" className="btn sm ghost" onClick={() => { setQ(""); setCat(""); }}>tampilkan semua</button>
          </p>
        </div>
      ) : grouped ? (
        cats
          .map((c) => ({ cat: c, items: shown.filter((b) => b.category === c) }))
          .concat([{ cat: "", items: shown.filter((b) => !cats.includes(b.category)) }])
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section key={g.cat || "_lain"} data-testid="shelf-section">
              <div className="shelf-section">
                <h2>{g.cat || "Lainnya"}</h2>
                <span className="count">{g.items.length} buku</span>
              </div>
              <div className="shelf">
                {g.items.map((b) => (
                  <Tile key={b.id} b={b} slotsFull={slotsFull} isAdmin={isAdmin} />
                ))}
              </div>
            </section>
          ))
      ) : (
        <div className="shelf">
          {shown.map((b) => (
            <Tile key={b.id} b={b} slotsFull={slotsFull} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </>
  );
}

function Tile({ b, slotsFull, isAdmin }: { b: CatalogBook; slotsFull: boolean; isAdmin: boolean }) {
  const out = b.available < 1;
  return (
    <article className="tile" data-testid="book-card">
      {/* Sampul + judul = tautan ke detail. Sebelumnya kartu mati: Bos
          *"ga bisa klik untuk lihat detail bukunya"*. Yang dibungkus tautan
          hanya sampul & judul — tombol Pinjam/Edit tetap tombol terpisah
          supaya tidak ada tautan bersarang di dalam tautan. */}
      <Link href={`/buku/${b.id}`} className="tile-link" aria-label={`Lihat detail ${b.title}`}>
        <div className="tile-cover">
          <BookCover book={b} size="md" />
          {b.mine && <span className="tile-mine">Dipinjam kamu</span>}
          {!b.mine && out && (
            <div className="tile-out">
              <span>Semua dipinjam</span>
            </div>
          )}
        </div>
        <h3 className="tile-title" title={b.title}>{b.title}</h3>
      </Link>
      <div className="tile-author">
        {b.author}
        {b.pages ? ` · ${b.pages} hlm` : ""}
      </div>
      <div className="tile-badges">
        {b.mine ? (
          <span className="chip amber">Kamu pinjam</span>
        ) : b.available > 0 ? (
          <span className="chip green">Tersedia {b.available}/{b.stock}</span>
        ) : (
          <span className="chip red">Habis</span>
        )}
      </div>
      {b.holders.length > 0 && (
        <div className="tile-author" data-testid="holders" title={b.holders.join(", ")}>
          {b.mine && b.holders.length === 1 ? "Dipinjam kamu" : `Dipinjam: ${b.holders.join(", ")}`}
        </div>
      )}
      <div className="row">
        <BorrowButton
          bookId={b.id}
          title={b.title}
          disabled={b.mine || b.available < 1 || slotsFull}
          label={b.mine ? "Sedang dipinjam" : "Pinjam"}
        />
        {isAdmin && (
          <Link className="btn sm ghost" href="/admin/buku" aria-label={`Edit ${b.title}`}>
            Edit
          </Link>
        )}
      </div>
    </article>
  );
}
