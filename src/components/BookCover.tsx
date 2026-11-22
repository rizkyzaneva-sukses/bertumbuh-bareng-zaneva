import { coverPattern, coverTheme, coverTitleLines, coverTitleSize, coverSrc, splitTitle } from "@/lib/cover";

export type CoverBook = {
  id: string;
  title: string;
  author: string;
  category: string;
  coverUrl?: string | null;
};

/**
 * Sampul buku 2:3 bergaya etalase toko.
 *
 * Kalau `coverUrl` ada → gambar asli. Kalau tidak → sampul generatif: gradien
 * warna kategori (divariasikan per buku) + motif geometris + tipografi judul,
 * sehingga rak tetap terlihat seperti display buku, bukan daftar judul teks.
 * (Bos: *"tambahin cover dong jadi bukan text judul aja"*.)
 */
export function BookCover({
  book,
  size = "md",
  className = "",
}: {
  book: CoverBook;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const src = coverSrc(book.coverUrl);
  const cls = `cover cover-${size} ${className}`.trim();

  if (src) {
    return (
      <div className={cls} data-testid="book-cover" data-cover="image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Sampul ${book.title}`} loading="lazy" decoding="async" />
        <span className="cover-sheen" aria-hidden />
      </div>
    );
  }

  const t = coverTheme(book.category, book.id);
  const pat = coverPattern(book.id);
  const { main, sub } = splitTitle(book.title);
  const fs = coverTitleSize(book.title);
  const lines = coverTitleLines(book.title);

  return (
    <div
      className={cls}
      data-testid="book-cover"
      data-cover="generated"
      data-pattern={pat}
      style={{ background: `linear-gradient(${t.deg}deg, ${t.a} 0%, ${t.b} 100%)`, color: t.ink }}
      role="img"
      aria-label={`Sampul ${book.title} karya ${book.author}`}
    >
      <span className="cover-art" aria-hidden>
        {pat === 0 && <span className="cv-circle" style={{ background: t.acc }} />}
        {pat === 1 && <span className="cv-bars" style={{ color: t.acc }} />}
        {pat === 2 && (
          <span className="cv-rings" style={{ borderColor: t.acc, color: t.acc }}>
            <i />
            <i />
            <i />
          </span>
        )}
        {pat === 3 && <span className="cv-stripes" style={{ background: t.acc }} />}
        {pat === 4 && (
          <>
            <span className="cv-block" style={{ background: t.acc }} />
            <span className="cv-dot" style={{ background: t.acc }} />
          </>
        )}
        {pat === 5 && <span className="cv-arc" style={{ borderColor: t.acc }} />}
      </span>
      <span className="cover-spine" aria-hidden />
      <div className="cover-body">
        {book.category ? (
          <span className="cover-cat" style={{ color: t.acc }}>
            {book.category}
          </span>
        ) : null}
        <span
          className="cover-title"
          style={{ fontSize: `clamp(9px, ${fs}cqw, 30px)`, WebkitLineClamp: lines }}
        >
          {main}
        </span>
        {sub ? <span className="cover-sub">{sub}</span> : null}
        <span className="cover-author">{book.author}</span>
      </div>
      <span className="cover-rule" style={{ background: t.acc }} aria-hidden />
    </div>
  );
}
