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
export function Catalog({ books, slotsFull, isAdmin, lamaHari }: { books: CatalogBook[]; slotsFull: boolean; isAdmin: boolean; lamaHari: number }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  /**
   * Filter ketersediaan. Bos: *"tambahkan di rak buku filter buku mana aja yg
   * masih free blm dipinjam dan mana saja yg lagi dipinjam"*.
   *
   * "Tersedia" = semua eksemplar masih di rak (tidak ada satu pun yang dipegang).
   * "Dipinjam" = minimal satu eksemplar sedang dipegang orang. Buku stok 2 yang
   * 1 dipinjam masuk "Dipinjam" (bukan dua-duanya) supaya tidak ada buku yang
   * muncul dobel dan hitungannya tetap bisa dijumlahkan.
   */
  const [sisa, setSisa] = useState<"" | "tersedia" | "dipinjam">("");
  const cats = useMemo(() => categoriesInUse(books.map((b) => b.category)), [books]);
  const jumlahTersedia = books.filter((b) => b.holders.length === 0).length;
  const jumlahDipinjam = books.length - jumlahTersedia;
  const shown = books.filter((b) => {
    const t = `${b.title} ${b.author} ${b.category} ${b.synopsis}`.toLowerCase();
    if (q && !t.includes(q.toLowerCase())) return false;
    if (cat && b.category !== cat) return false;
    if (sisa === "tersedia" && b.holders.length > 0) return false;
    if (sisa === "dipinjam" && b.holders.length === 0) return false;
    return true;
  });
  // Lorong hanya dipakai saat tidak sedang mencari, memilih kategori, atau filter status.
  const grouped = !q && !cat && !sisa;

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
      <div className="tabs-scroll">
      <div className="tabs status-tabs" role="tablist" aria-label="Filter status buku" data-testid="filter-status">
        <button type="button" className={sisa === "" ? "on" : ""} onClick={() => setSisa("")} style={{ cursor: "pointer" }}>
          Semua <span className="tab-count">{books.length}</span>
        </button>
        <button
          type="button"
          className={sisa === "tersedia" ? "on" : ""}
          onClick={() => setSisa(sisa === "tersedia" ? "" : "tersedia")}
          aria-pressed={sisa === "tersedia"}
          style={{ cursor: "pointer" }}
          data-testid="filter-tersedia"
        >
          <span className="tab-emoji" aria-hidden="true">✅ </span>Tersedia <span className="tab-count">{jumlahTersedia}</span>
        </button>
        <button
          type="button"
          className={sisa === "dipinjam" ? "on" : ""}
          onClick={() => setSisa(sisa === "dipinjam" ? "" : "dipinjam")}
          aria-pressed={sisa === "dipinjam"}
          style={{ cursor: "pointer" }}
          data-testid="filter-dipinjam"
        >
          <span className="tab-emoji" aria-hidden="true">📕 </span>Dipinjam <span className="tab-count">{jumlahDipinjam}</span>
        </button>
      </div>
      </div>
      <div className="tabs-scroll">
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
      </div>
      <p className="shelf-hint" data-testid="shelf-hint">
        {shown.length} buku
        {sisa === "tersedia" ? " siap dipinjam" : sisa === "dipinjam" ? " sedang dipegang orang" : ""}
        {slotsFull ? " · slot pinjammu penuh, balikin dulu satu buku ya" : ""}
      </p>

      {shown.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {q || cat
              ? "Tidak ada buku yang cocok. "
              : sisa === "tersedia"
                ? "Semua buku di rak sedang dipinjam. "
                : sisa === "dipinjam"
                  ? "Tidak ada buku yang sedang dipinjam — semua ada di rak. "
                  : "Belum ada buku di rak. "}
            Coba kata kunci lain atau <button type="button" className="btn sm ghost" onClick={() => { setQ(""); setCat(""); setSisa(""); }}>tampilkan semua</button>
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
                  <Tile key={b.id} b={b} slotsFull={slotsFull} isAdmin={isAdmin} lamaHari={lamaHari} />
                ))}
              </div>
            </section>
          ))
      ) : (
        <div className="shelf">
          {shown.map((b) => (
            <Tile key={b.id} b={b} slotsFull={slotsFull} isAdmin={isAdmin} lamaHari={lamaHari} />
          ))}
        </div>
      )}
    </>
  );
}

function Tile({ b, slotsFull, isAdmin, lamaHari }: { b: CatalogBook; slotsFull: boolean; isAdmin: boolean; lamaHari: number }) {
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
          lamaHari={lamaHari}
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
