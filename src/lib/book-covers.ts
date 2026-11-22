/**
 * Sampul asli yang SUDAH diverifikasi mata (bukan hasil tebak mesin).
 *
 * Verifikasi: gambar diambil dari covers.openlibrary.org, disusun jadi
 * contact-sheet, lalu dicocokkan judul & penulis yang TERCETAK di gambar dengan
 * buku di rak. Kandidat yang ternyata buku LAIN saya buang — mis.
 * "The Art of Stoicism" (Adora Kinara) yang cocok ke "Stoicism and the Art of
 * Happiness" (Donald Robertson), "The Power of Introvert" yang cocok ke "Quiet"
 * versi ringkasan, dan "The Power of Now" yang ternyata kalender 2008.
 * Sampul salah lebih buruk daripada sampul generatif karena menipu pembaca.
 *
 * Sumber: Open Library Covers API (openlibrary.org) — metadata & sampul
 * berlisensi terbuka. Bukan aset milik app.
 */
export const VERIFIED_COVERS: Record<string, string> = {
  "Deep Work": "https://covers.openlibrary.org/b/id/7988607-M.jpg",
  "Never Split the Difference": "https://covers.openlibrary.org/b/id/8365942-M.jpg",
  "Testing Business Ideas": "https://covers.openlibrary.org/b/id/9388387-M.jpg",
  "The Lean Startup": "https://covers.openlibrary.org/b/id/7104760-M.jpg",
  "The Visual MBA": "https://covers.openlibrary.org/b/id/10328298-M.jpg",
  "Think Again": "https://covers.openlibrary.org/b/id/10470266-M.jpg",
  "Psikologi Pasangan": "https://covers.openlibrary.org/b/id/14544827-M.jpg",
};
