import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { borrowBook, returnLoan, AppError } from "@/lib/loans";
import { RAK_FILTER, ARSIP_FILTER, setArchived } from "@/lib/archive";
import { getDashboard } from "@/lib/stats";
import { saveProgress, markFinished } from "@/lib/reading";
import { resetDb } from "./helpers";

/**
 * Arsip buku — Bos: *"Sekalian tambahkan fitur arsipkan buku, takutnya saya
 * butuh buat pribadi"*.
 *
 * Yang WAJIB dibuktikan di sini (bukan cuma "tombolnya ada"):
 *  1. buku arsip hilang dari rak, tapi barisnya TIDAK terhapus
 *  2. buku arsip tidak bisa dipinjam, termasuk lewat API langsung
 *  3. riwayat pinjam + progres baca TETAP UTUH setelah diarsipkan
 *  4. pinjaman yang berjalan tetap bisa dikembalikan
 *  5. bisa dikembalikan ke rak dan langsung bisa dipinjam lagi
 *  6. arsip berulang tidak error dan tidak memundurkan tanggal
 */

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
});

async function mk(title = "Atomic Habits") {
  const u = await prisma.user.create({ data: { name: "Tia", phone: "6281111111111", passwordHash: "x" } });
  const b = await prisma.book.create({ data: { title, author: "James Clear", stock: 1 } });
  return { u, b };
}

describe("arsip buku", () => {
  it("hilang dari rak tapi datanya TIDAK terhapus", async () => {
    const { b } = await mk();
    expect(await prisma.book.count({ where: RAK_FILTER })).toBe(1);

    await setArchived(b.id, true);

    // di rak = 0
    expect(await prisma.book.count({ where: RAK_FILTER })).toBe(0);
    // di arsip = 1
    expect(await prisma.book.count({ where: ARSIP_FILTER })).toBe(1);
    // dan barisnya masih ADA (ini beda krusial dengan Hapus)
    const masihAda = await prisma.book.findUnique({ where: { id: b.id } });
    expect(masihAda).not.toBeNull();
    expect(masihAda!.title).toBe("Atomic Habits");
    expect(masihAda!.archivedAt).toBeInstanceOf(Date);
  });

  it("tidak bisa dipinjam walau request langsung ke API (bukan cuma disembunyikan)", async () => {
    const { u, b } = await mk();
    await setArchived(b.id, true);

    // Ini inti "server yang menjaga", bukan UI. Tanpa cek di borrowBook,
    // menyembunyikan kartu di rak hanya kosmetik.
    await expect(borrowBook(u.id, b.id)).rejects.toMatchObject({ code: "ARCHIVED" });
    expect(await prisma.loan.count()).toBe(0);
  });

  it("riwayat pinjam & progres baca TETAP UTUH setelah diarsipkan", async () => {
    const { u, b } = await mk();
    const loan = await borrowBook(u.id, b.id);
    await saveProgress(u.id, b.id, 42);
    await markFinished(u.id, b.id);
    await returnLoan(loan.id, "USER");

    await setArchived(b.id, true);

    // riwayat pinjam
    const loans = await prisma.loan.findMany({ where: { bookId: b.id } });
    expect(loans).toHaveLength(1);
    expect(loans[0].returnedAt).not.toBeNull();
    // progres baca
    const prog = await prisma.readingProgress.findUnique({
      where: { userId_bookId: { userId: u.id, bookId: b.id } },
    });
    expect(prog?.lastPage).toBe(42);
    expect(prog?.status).toBe("SELESAI");
  });

  it("pinjaman yang BERJALAN tetap bisa dikembalikan setelah buku diarsipkan", async () => {
    // Kasus nyata Bos: "buku boleh dibawa ke rumah", lalu bukunya mau disimpan.
    // Mengarsipkan tidak boleh mengunci pinjaman yang sudah berjalan.
    const { u, b } = await mk();
    const loan = await borrowBook(u.id, b.id);

    const res = await setArchived(b.id, true);
    expect(res.activeLoans).toBe(1); // admin diberi tahu ada pinjaman berjalan

    await expect(returnLoan(loan.id, "USER")).resolves.toBeTruthy();
    const after = await prisma.loan.findUnique({ where: { id: loan.id } });
    expect(after!.returnedAt).not.toBeNull();
  });

  it("dikembalikan ke rak → muncul lagi dan bisa dipinjam", async () => {
    const { u, b } = await mk();
    await setArchived(b.id, true);
    await expect(borrowBook(u.id, b.id)).rejects.toMatchObject({ code: "ARCHIVED" });

    await setArchived(b.id, false);

    expect(await prisma.book.count({ where: RAK_FILTER })).toBe(1);
    const loan = await borrowBook(u.id, b.id);
    expect(loan.bookId).toBe(b.id);
  });

  it("arsip dua kali tidak error dan tidak memundurkan tanggal arsip", async () => {
    const { b } = await mk();
    const t1 = new Date("2026-11-20T10:00:00+07:00");
    await setArchived(b.id, true, t1);

    // kedua kali, dengan waktu berbeda — tanggal PERTAMA harus bertahan
    const res = await setArchived(b.id, true, new Date("2026-11-25T10:00:00+07:00"));
    expect(res.archived).toBe(true);

    const after = await prisma.book.findUnique({ where: { id: b.id } });
    expect(after!.archivedAt!.toISOString()).toBe(t1.toISOString());
  });

  it("buku tidak dikenal → 404, bukan diam-diam sukses", async () => {
    await expect(setArchived("tidak-ada", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("dashboard tidak lagi menghitung buku arsip", async () => {
    const { b } = await mk();
    expect((await getDashboard()).totals.books).toBe(1);
    await setArchived(b.id, true);
    expect((await getDashboard()).totals.books).toBe(0);
  });

  it("hapus PERMANEN tetap berbeda dari arsip: barisnya benar-benar hilang", async () => {
    const { b } = await mk();
    await prisma.book.delete({ where: { id: b.id } });
    expect(await prisma.book.findUnique({ where: { id: b.id } })).toBeNull();
  });
});
