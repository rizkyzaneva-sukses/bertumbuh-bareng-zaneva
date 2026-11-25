-- Bukti pengembalian buku (foto).
-- Ditulis IDEMPOTENT: aman dijalankan berulang. Tidak ada DROP, tidak
-- menyentuh data lama.
--
-- Kenapa tabel terpisah, bukan kolom di Loan:
--   Loan adalah catatan transaksi. Foto adalah LAMPIRAN yang boleh dihapus
--   admin (mis. foto tidak jelas / salah kirim) tanpa mengubah status kembali
--   bukunya. Memisahkan keduanya membuat penanganan "hapus bukti" tidak
--   berisiko menyentuh data pinjaman.
--
-- Satu peminjaman satu bukti (loanId unik). Foto disimpan di DB, bukan disk —
-- pola yang sama dengan BookCover, supaya tidak butuh volume permanen dan
-- tidak hilang saat container di-deploy ulang.

CREATE TABLE IF NOT EXISTS "ReturnProof" (
  "loanId"    TEXT NOT NULL,
  "mime"      TEXT NOT NULL DEFAULT 'image/jpeg',
  "bytes"     BYTEA NOT NULL,
  -- Dimensi & ukuran asli dicatat supaya admin bisa menilai kualitas bukti
  -- tanpa harus membuka gambarnya.
  "width"     INTEGER,
  "height"    INTEGER,
  "sizeBytes" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnProof_pkey" PRIMARY KEY ("loanId")
);

DO $$ BEGIN
  ALTER TABLE "ReturnProof"
    ADD CONSTRAINT "ReturnProof_loanId_fkey"
    FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
