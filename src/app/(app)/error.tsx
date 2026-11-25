"use client";

import { useEffect } from "react";

/**
 * Penangkap error untuk grup halaman app.
 *
 * Tanpa berkas ini, satu query gagal (DB putus, timeout, data aneh) membuat
 * Next.js menampilkan layar error generik tanpa jalan keluar — di HP itu
 * terlihat seperti app rusak permanen. Dengan ini anggota melihat pesan yang
 * bisa dimengerti + tombol coba lagi.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Jejak untuk admin; jangan tampilkan detail teknis ke anggota.
    console.error("[app] halaman gagal dimuat:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <div data-testid="halaman-error">
      <h1>Halaman gagal dimuat</h1>
      <p className="muted">
        Mungkin koneksi sedang putus. Coba lagi — data kamu tidak hilang.
      </p>
      <div className="row">
        <button className="btn" onClick={reset} data-testid="coba-lagi">Coba lagi</button>
        <a className="btn ghost" href="/">Ke Beranda</a>
      </div>
    </div>
  );
}
