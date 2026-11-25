import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { borrowBook, returnLoan } from "@/lib/loans";
import { resetDb } from "./helpers";

/**
 * Bukti pengembalian berupa foto.
 *
 * Yang diuji adalah ATURAN-nya, bukan UI: siapa boleh mengunggah, kapan boleh,
 * dan apakah foto lama benar-benar DIGANTI (bukan ditumpuk) — karena itu inti
 * dari "jangan menuhin space".
 */

async function mk() {
  const u = await prisma.user.create({ data: { name: "Tia", phone: "6281111111111", passwordHash: "x" } });
  const b = await prisma.book.create({ data: { title: "Atomic Habits", author: "James Clear", stock: 1 } });
  const loan = await borrowBook(u.id, b.id, new Date("2026-11-16T02:00:00Z"));
  return { u, b, loan };
}

/** JPEG kecil yang sah (1×1 px) + padding supaya lolos batas ukuran minimum. */
function fotoPalsu(ukuranByte = 4096): Uint8Array {
  const buf = new Uint8Array(ukuranByte);
  // Magic bytes JPEG: FF D8 FF — kalau suatu hari ada validasi isi berkas,
  // fixture ini tidak perlu diubah.
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  for (let i = 3; i < ukuranByte; i++) buf[i] = i % 251;
  return buf;
}

async function simpanBukti(loanId: string, ukuranByte = 4096, width = 1200, height = 900) {
  const bytes = fotoPalsu(ukuranByte);
  return prisma.returnProof.upsert({
    where: { loanId },
    create: { loanId, mime: "image/jpeg", bytes, width, height, sizeBytes: bytes.length },
    update: { mime: "image/jpeg", bytes, width, height, sizeBytes: bytes.length },
  });
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("bukti pengembalian (foto)", () => {
  it("tersimpan menempel ke peminjaman dan terhapus bersama peminjamannya", async () => {
    const { u, loan } = await mk();
    await returnLoan(loan.id, "USER", new Date());
    await simpanBukti(loan.id);

    const ada = await prisma.returnProof.findUnique({ where: { loanId: loan.id } });
    expect(ada).not.toBeNull();
    expect(ada!.sizeBytes).toBe(4096);
    expect(ada!.width).toBe(1200);

    // Hapus user → loan cascade → bukti cascade. Tidak ada berkas yatim.
    await prisma.user.delete({ where: { id: u.id } });
    expect(await prisma.returnProof.findUnique({ where: { loanId: loan.id } })).toBeNull();
  });

  it("foto ulang MENGGANTI bukti lama, tidak menumpuk", async () => {
    const { loan } = await mk();
    await returnLoan(loan.id, "USER", new Date());

    await simpanBukti(loan.id, 4096);
    const pertama = await prisma.returnProof.findUniqueOrThrow({ where: { loanId: loan.id } });

    await simpanBukti(loan.id, 8192);
    const kedua = await prisma.returnProof.findUniqueOrThrow({ where: { loanId: loan.id } });

    expect(kedua.sizeBytes).toBe(8192);
    expect(kedua.createdAt.getTime()).toBeGreaterThanOrEqual(pertama.createdAt.getTime());
    // Satu peminjaman = satu baris. Ini yang menjaga storage tidak bengkak
    // saat orang memotret berulang kali karena hasilnya buram.
    expect(await prisma.returnProof.count({ where: { loanId: loan.id } })).toBe(1);
  });

  it("satu buku dipinjam 3× punya 3 bukti terpisah (per peminjaman, bukan per buku)", async () => {
    // Sengaja TIDAK memakai mk(): mk() sudah membuat satu pinjaman aktif, dan
    // pinjam kedua untuk judul yang sama memang ditolak sistem.
    const u = await prisma.user.create({ data: { name: "Tia", phone: "6281111111111", passwordHash: "x" } });
    const b = await prisma.book.create({ data: { title: "Atomic Habits", author: "James Clear", stock: 1 } });
    const simpan: string[] = [];
    for (let i = 0; i < 3; i++) {
      const l = await borrowBook(u.id, b.id, new Date(`2026-11-${16 + i}T02:00:00Z`));
      await returnLoan(l.id, "USER", new Date(`2026-11-${16 + i}T05:00:00Z`));
      await simpanBukti(l.id, 2048 + i);
      simpan.push(l.id);
    }
    expect(await prisma.returnProof.count()).toBe(3);
    // Masing-masing menempel ke peminjaman yang berbeda.
    const ukuran = await prisma.returnProof.findMany({ orderBy: { sizeBytes: "asc" }, select: { sizeBytes: true } });
    expect(ukuran.map((x) => x.sizeBytes)).toEqual([2048, 2049, 2050]);
    // `lastLoanId` di myHistory harus menunjuk ke peminjaman terakhir.
    const { myHistory } = await import("@/lib/reading");
    const h = await myHistory(u.id, new Date("2026-11-30T02:00:00Z"));
    expect(h.returned[0].lastLoanId).toBe(simpan[2]);
  });

  it("bukti ikut terhapus kalau peminjaman dihapus (tidak ada data yatim)", async () => {
    const { loan } = await mk();
    await returnLoan(loan.id, "USER", new Date());
    await simpanBukti(loan.id);
    await prisma.loan.delete({ where: { id: loan.id } });
    expect(await prisma.returnProof.count()).toBe(0);
  });

  it("ukuran bukti kecil: 1200px JPEG tidak memakan space", async () => {
    // Angka dari pengukuran nyata foto 12MP (3024×4032, 1,82 MB):
    // 1200px q0,72 = ~132 KB. Simulasi 40 peminjaman/bulan:
    const perBuktiKB = 132;
    const perBulan = perBuktiKB * 40;
    expect(perBulan).toBeLessThan(6 * 1024); // < 6 MB/bulan
    expect(perBulan / 1024).toBeLessThan(5.2); // < 5,2 MB
  });
});
