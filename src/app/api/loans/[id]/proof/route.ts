import { prisma } from "@/lib/db";
import { AppError } from "@/lib/loans";
import { handler, json, fail } from "@/lib/http";

/**
 * Foto bukti pengembalian buku.
 *
 * Bos: *"Difoto bisa ga? Tp image ini harus kepress biar aman ga menuhin space."*
 *
 * Kompresi terjadi di HP peminjam (lihat `src/lib/proof-image.ts`): foto 12MP
 * ~1,8 MB jadi ~130 KB sebelum naik ke jaringan. Server tetap memeriksa ulang
 * batas ukuran — jangan percaya klien, orang bisa mengirim apa saja lewat curl.
 */

/** Batas berkas MASUK. Klien sudah mengompres ~130 KB; 2 MB sudah longgar. */
const MAX_BYTES = 2 * 1024 * 1024;

const OK_MIME = ["image/jpeg", "image/png", "image/webp"];

/** Bukti yang lebih kecil dari ini hampir pasti bukan foto (ikon / kiriman salah). */
const MIN_BYTES = 1024;

/** Hanya boleh 1 bukti per peminjaman. */
export const GET = handler<{ id: string }>({}, async (_req, { user, params }) => {
  const loan = await prisma.loan.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, returnedAt: true },
  });
  if (!loan) throw new AppError("NOT_FOUND", "Peminjaman tidak ditemukan", 404);
  if (loan.userId !== user.id && user.role !== "ADMIN")
    throw new AppError("FORBIDDEN", "Ini bukan pinjamanmu", 403);

  const proof = await prisma.returnProof.findUnique({
    where: { loanId: params.id },
    select: { mime: true, bytes: true, width: true, height: true, createdAt: true },
  });
  if (!proof) throw new AppError("NO_PROOF", "Belum ada foto bukti untuk peminjaman ini", 404);

  const body = new Blob([new Uint8Array(proof.bytes)], { type: proof.mime });
  return new Response(body, {
    headers: {
      "Content-Type": proof.mime,
      "Content-Length": String(body.size),
      // Bukti tidak berubah setelah diunggah → aman di-cache.
      "Cache-Control": "private, max-age=86400",
    },
  });
});

/**
 * Unggah foto bukti. Body: multipart/form-data field `file`.
 *
 * Aturan siapa boleh:
 *  - peminjam: hanya untuk pinjamannya sendiri, dan hanya setelah menandai
 *    buku kembali (bukti = "bukuku sudah saya taruh di rak").
 *  - admin: boleh untuk pinjaman siapa pun (mis. menerima buku di meja).
 *
 * Boleh dipanggil ulang: bukti lama DIGANTI, bukan ditumpuk. Jadi orang yang
 * fotonya buram bisa foto ulang tanpa meninggalkan berkas lama menuhin space.
 */
export const POST = handler<{ id: string }>({}, async (req, { user, params }) => {
  const loan = await prisma.loan.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, returnedAt: true },
  });
  if (!loan) throw new AppError("NOT_FOUND", "Peminjaman tidak ditemukan", 404);

  const isAdmin = user.role === "ADMIN";
  if (loan.userId !== user.id && !isAdmin) throw new AppError("FORBIDDEN", "Ini bukan pinjamanmu", 403);

  // Bukti hanya masuk akal kalau bukunya memang sudah kembali.
  if (!loan.returnedAt)
    throw new AppError("NOT_RETURNED", "Tandai bukunya sudah kembali dulu, baru unggah foto bukti.", 409);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Kirim berkas sebagai multipart/form-data", 400, "FORMAT");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail("Berkas foto tidak ditemukan", 400, "NO_FILE");
  if (file.size === 0) return fail("Berkas kosong", 400, "EMPTY");
  if (file.size > MAX_BYTES) return fail("Foto maksimal 2 MB setelah dikompres", 413, "TOO_BIG");
  if (file.size < MIN_BYTES) return fail("Berkas terlalu kecil — sepertinya bukan foto", 415, "TOO_SMALL");
  if (!OK_MIME.includes(file.type)) return fail("Format harus JPG, PNG, atau WebP", 415, "MIME");

  // Dimensi dikirim klien sebagai teks; tidak wajib ada (diabaikan kalau aneh).
  const angka = (v: FormDataEntryValue | null) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n > 0 && n <= 10000 ? n : null;
  };
  const width = angka(form.get("width"));
  const height = angka(form.get("height"));

  const bytes = new Uint8Array(await file.arrayBuffer());
  await prisma.returnProof.upsert({
    where: { loanId: loan.id },
    create: { loanId: loan.id, mime: file.type, bytes, width, height, sizeBytes: bytes.length },
    update: { mime: file.type, bytes, width, height, sizeBytes: bytes.length },
  });

  return json({ ok: true, sizeBytes: bytes.length, width, height }, 201);
});

/** Hapus bukti (admin). Mis. foto tidak jelas atau salah kirim. */
export const DELETE = handler<{ id: string }>({ admin: true }, async (_req, { params }) => {
  await prisma.returnProof.deleteMany({ where: { loanId: params.id } });
  return json({ ok: true });
});
