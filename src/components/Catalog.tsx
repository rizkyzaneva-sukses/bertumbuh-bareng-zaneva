"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { BorrowButton } from "./LoanActions";
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
  /** Nama orang yang sedang memegang buku ini (kosong kalau tersedia). */
  holders: string[];
};

export function Catalog({ books, slotsFull, isAdmin }: { books: CatalogBook[]; slotsFull: boolean; isAdmin: boolean }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const cats = useMemo(() => categoriesInUse(books.map((b) => b.category)), [books]);
  const shown = books.filter((b) => {
    const t = `${b.title} ${b.author} ${b.category} ${b.synopsis}`.toLowerCase();
    return (!q || t.includes(q.toLowerCase())) && (!cat || b.category === cat);
  });
  return (
    <>
      <div className="field">
        <input type="search" placeholder="Cari judul, penulis, atau topik…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari buku" data-testid="search" />
      </div>
      <div className="field">
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter kategori">
          <option value="">Semua kategori</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <p className="muted small">{shown.length} buku{slotsFull ? " · slot pinjammu penuh, balikin dulu satu buku ya" : ""}</p>
      <div className="grid auto">
        {shown.map((b) => (
          <article className="card book" key={b.id} data-testid="book-card" style={{ marginBottom: 0 }}>
            <h3>{b.title}</h3>
            <div className="small muted">{b.author}{b.pages ? ` · ${b.pages} hlm` : ""}</div>
            <div className="meta">
              {b.category && <span className="chip">{b.category}</span>}
              {b.mine ? <span className="chip amber">Kamu pinjam</span> : b.available > 0 ? <span className="chip green">Tersedia {b.available}/{b.stock}</span> : <span className="chip red">Sedang dipinjam semua</span>}
            </div>
            {b.holders.length > 0 && (
              <div className="small muted" data-testid="holders">
                {b.mine && b.holders.length === 1 ? "Dipegang kamu" : `Dipegang: ${b.holders.join(", ")}`}
              </div>
            )}
            {b.synopsis && <p className="syn" style={{ margin: 0 }}>{b.synopsis}</p>}
            <div className="row">
              <BorrowButton bookId={b.id} title={b.title} disabled={b.mine || b.available < 1 || slotsFull} label={b.mine ? "Sedang dipinjam" : "Pinjam"} />
              {isAdmin && <Link className="btn sm ghost" href="/admin/buku">Edit</Link>}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
