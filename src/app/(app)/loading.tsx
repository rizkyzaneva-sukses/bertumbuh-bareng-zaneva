/**
 * Indikator muat untuk grup halaman app.
 *
 * Kenapa ini penting: hampir semua halaman `force-dynamic` (data pinjaman harus
 * segar), jadi setiap navigasi menunggu database. Sebelum ada berkas ini,
 * setelah menekan menu layar hanya DIAM — tidak ada tanda apa pun bahwa app
 * sedang bekerja. Di jaringan yang lambat itu terasa seperti app hang.
 *
 * Next.js menampilkan ini otomatis selama server component halaman belum
 * selesai, jadi tidak perlu satu baris pun di tiap halaman.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" data-testid="halaman-memuat">
      <p className="muted" style={{ marginTop: 0 }}>Memuat…</p>
      {/* Kerangka kartu: memberi bentuk halaman sekilas, bukan layar kosong. */}
      <div className="card" style={{ height: 92, opacity: 0.5 }} />
      <div className="card" style={{ height: 92, opacity: 0.35 }} />
      <div className="card" style={{ height: 92, opacity: 0.2 }} />
    </div>
  );
}
