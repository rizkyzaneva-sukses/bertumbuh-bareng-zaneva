import { prisma } from "@/lib/db";
import { handler, json } from "@/lib/http";
import { BookBody } from "@/lib/schemas";
import { RAK_FILTER } from "@/lib/archive";
import { kabariBukuBaru, pushTerkonfigurasi } from "@/lib/push/kirim";

// Hanya buku yang ada di rak. Buku arsip tidak boleh muncul di daftar publik.
export const GET = handler({}, async () => json({ ok: true, books: await prisma.book.findMany({ where: RAK_FILTER, orderBy: { title: "asc" } }) }));

/**
 * Tambah buku.
 *
 * Setelah buku tersimpan, semua anggota dikabari lewat Web Push.
 * Bos: *"App munculin notif dong kaya app rajinibadah biar semua dapet notif
 * klo ada buku baru"*.
 *
 * Notifikasi TIDAK boleh menggagalkan penyimpanan: kalau push error, buku tetap
 * masuk dan API tetap 201 — hanya push-nya yang gagal (dicatat di log).
 */
export const POST = handler({ admin: true }, async (req) => {
  const data = BookBody.parse(await req.json());
  const book = await prisma.book.create({ data: { ...data, pages: data.pages ?? null } });

  let push: { terkonfigurasi: boolean; tujuan: number; terkirim: number; gagal: number; dihapus: number } | null = null;
  if (pushTerkonfigurasi()) {
    try {
      push = await kabariBukuBaru(book.title, book.author);
      console.log("[buku-baru] push:", JSON.stringify(push));
    } catch (e) {
      console.error("[buku-baru] push gagal:", String((e as Error).message ?? e));
    }
  }

  return json({ ok: true, book, push }, 201);
});
