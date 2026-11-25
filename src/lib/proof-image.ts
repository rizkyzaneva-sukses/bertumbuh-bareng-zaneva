/**
 * Kompres foto bukti pengembalian DI BROWSER, sebelum dikirim ke server.
 *
 * Bos: *"Difoto bisa ga? Tp image ini harus kepress biar aman ga menuhin space."*
 *
 * Kenapa di browser, bukan di server:
 *  - Foto HP 12MP ≈ 1,8–4 MB. Kalau dikirim apa adanya, kuota data peminjam
 *    terbakar dan server menahan berkas besar hanya untuk mengecilkannya.
 *  - Setelah dikompres di HP, yang naik ke jaringan cuma ~130 KB.
 *
 * Ukuran yang dipilih: sisi terpanjang 1200px, JPEG kualitas 0,72.
 * Diukur pada foto 12MP (3024×4032): 1,82 MB → 132 KB. Masih cukup jelas untuk
 * membaca judul buku dan melihat kondisi fisiknya.
 */

/** Sisi terpanjang setelah dikompres (px). */
export const PROOF_MAX_SIDE = 1200;

/** Kualitas JPEG. 0,72 = titik seimbang tajam vs kecil. */
export const PROOF_QUALITY = 0.72;

/** Batas berkas MASUK yang mau kita proses. Di atas ini hampir pasti bukan foto. */
export const PROOF_INPUT_MAX_BYTES = 25 * 1024 * 1024;

export type ProofHasil = { blob: Blob; width: number; height: number; nama: string };

/**
 * Kecilkan gambar. Melempar Error berpesan Indonesia kalau berkas tidak bisa
 * dibaca sebagai gambar (mis. PDF yang di-rename jadi .jpg).
 */
export async function kompresFoto(file: File): Promise<ProofHasil> {
  if (file.size > PROOF_INPUT_MAX_BYTES) {
    throw new Error("Foto terlalu besar (maksimal 25 MB). Coba foto ulang dengan resolusi lebih kecil.");
  }

  const bitmap = await bacaGambar(file);

  // Hitung dimensi target dengan menjaga rasio. Jangan pernah MEMPERBESAR
  // gambar kecil — hasilnya cuma buram dan berkasnya malah lebih besar.
  const sisiTerpanjang = Math.max(bitmap.width, bitmap.height);
  const skala = sisiTerpanjang > PROOF_MAX_SIDE ? PROOF_MAX_SIDE / sisiTerpanjang : 1;
  const width = Math.max(1, Math.round(bitmap.width * skala));
  const height = Math.max(1, Math.round(bitmap.height * skala));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser ini tidak bisa mengolah foto. Coba lewat Chrome atau Safari.");
  // Latar putih: foto PNG transparan (screenshot) tidak jadi hitam saat di-JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", PROOF_QUALITY),
  );
  if (!blob) throw new Error("Gagal mengompres foto. Coba foto ulang.");

  return { blob, width, height, nama: "bukti-pengembalian.jpg" };
}

/** Baca File jadi ImageBitmap (cepat) atau <img> (cadangan untuk browser lama). */
async function bacaGambar(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // lanjut ke cara cadangan
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Berkas ini tidak terbaca sebagai gambar."));
      img.src = url;
    });
  } finally {
    // Aman dipanggil setelah onload: gambar sudah ada di memori.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Ukuran ramah dibaca: 132 KB / 1,2 MB. */
export function ukuranRingkas(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
