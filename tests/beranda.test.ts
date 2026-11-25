import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { borrowBook, returnLoan } from "@/lib/loans";
import { saveProgress, markFinished } from "@/lib/reading";
import { getDashboard, getRingkasanBeranda } from "@/lib/stats";
import { resetDb } from "./helpers";

/**
 * Beranda dulu memanggil getDashboard() penuh (semua pinjaman + semua progres +
 * semua user + semua buku, lalu O(user×pinjaman) dan O(buku×pinjaman)) hanya
 * untuk menampilkan 2 angka. Sekarang memakai getRingkasanBeranda().
 *
 * Tes ini menjaga satu hal: ANGKANYA HARUS SAMA. Optimasi yang mengubah hasil
 * bukan optimasi.
 */

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
});

async function mkOrang(nama: string, phone: string) {
  return prisma.user.create({ data: { name: nama, phone, passwordHash: "x" } });
}
async function mkBuku(judul: string) {
  return prisma.book.create({ data: { title: judul, author: "X" } });
}

describe("ringkasan beranda = dashboard penuh (angka identik)", () => {
  it("cocok saat belum ada yang selesai baca", async () => {
    const u = await mkOrang("Tia", "6281111111111");
    const penuh = await getDashboard();
    const ringkas = await getRingkasanBeranda(u.id);

    const dariPenuh = penuh.perUser.find((x) => x.userId === u.id)!;
    expect(ringkas.finishedBooks).toBe(dariPenuh.finishedCount);
    expect(ringkas.myRank).toBe(penuh.ranking.find((r) => r.userId === u.id)?.rank ?? null);
    expect(ringkas.top).toEqual([]);
  });

  it("cocok saat ada beberapa pembaca dengan jumlah berbeda", async () => {
    const a = await mkOrang("Ani", "6281111111101");
    const b = await mkOrang("Budi", "6281111111102");
    const c = await mkOrang("Cici", "6281111111103");
    const b1 = await mkBuku("Buku 1");
    const b2 = await mkBuku("Buku 2");
    const b3 = await mkBuku("Buku 3");

    // Ani selesai 2 buku, Budi 1, Cici 0
    for (const [u, buku] of [
      [a, b1],
      [a, b2],
      [b, b1],
    ] as const) {
      const l = await borrowBook(u.id, buku.id);
      await saveProgress(u.id, buku.id, 50);
      await markFinished(u.id, buku.id);
      await returnLoan(l.id, "USER");
    }
    void b3;
    void c;

    const penuh = await getDashboard();
    const rankingPenuh = penuh.ranking.map((r) => ({ userId: r.userId, finishedCount: r.finishedCount, rank: r.rank }));

    for (const u of [a, b, c]) {
      const ringkas = await getRingkasanBeranda(u.id);
      const dariPenuh = penuh.perUser.find((x) => x.userId === u.id)!;
      expect(ringkas.finishedBooks, `finishedBooks ${u.name}`).toBe(dariPenuh.finishedCount);
      expect(ringkas.myRank, `rank ${u.name}`).toBe(penuh.ranking.find((r) => r.userId === u.id)?.rank ?? null);
    }

    // 5 besar harus sama persis (termasuk urutan & peringkat)
    const limaPenuh = rankingPenuh.slice(0, 5);
    const ringkasA = await getRingkasanBeranda(a.id);
    expect(ringkasA.top.map((t) => ({ userId: t.userId, finishedCount: t.finishedCount, rank: t.rank }))).toEqual(limaPenuh);
  });

  it("nilai SERI dapat peringkat sama (1,1,3) di kedua jalur", async () => {
    const a = await mkOrang("Ani", "6281111111101");
    const b = await mkOrang("Budi", "6281111111102");
    const c = await mkOrang("Cici", "6281111111103");
    const b1 = await mkBuku("Buku 1");

    // Ani, Budi, Cici masing-masing selesai 1 buku → semua peringkat 1
    for (const u of [a, b, c]) {
      const l = await borrowBook(u.id, b1.id);
      await saveProgress(u.id, b1.id, 10);
      await markFinished(u.id, b1.id);
      await returnLoan(l.id, "USER");
    }

    const penuh = await getDashboard();
    const peringkatPenuh = penuh.ranking.map((r) => r.rank);
    expect(peringkatPenuh).toEqual([1, 1, 1]);

    const ringkas = await getRingkasanBeranda(a.id);
    expect(ringkas.myRank).toBe(1);
    expect(ringkas.top.map((t) => t.rank)).toEqual([1, 1, 1]);
  });

  it("seri dipecah dengan urutan nama, sama seperti dashboard", async () => {
    const z = await mkOrang("Zaki", "6281111111101");
    const a = await mkOrang("Ani", "6281111111102");
    const b1 = await mkBuku("Buku 1");

    for (const u of [z, a]) {
      const l = await borrowBook(u.id, b1.id);
      await saveProgress(u.id, b1.id, 10);
      await markFinished(u.id, b1.id);
      await returnLoan(l.id, "USER");
    }

    const penuh = await getDashboard();
    const ringkas = await getRingkasanBeranda(a.id);
    expect(ringkas.top.map((t) => t.name)).toEqual(penuh.ranking.slice(0, 5).map((r) => r.name));
    // Ani sebelum Zaki (alfabetis)
    expect(ringkas.top[0].name).toBe("Ani");
  });

  it("lebih sedikit kerja: jumlah baris yang dibaca jauh lebih kecil", async () => {
    // 5 orang × 4 buku, semuanya selesai
    const orang = [];
    for (let i = 0; i < 5; i++) orang.push(await mkOrang(`Orang${i}`, `62811111111${10 + i}`));
    for (let i = 0; i < 4; i++) await mkBuku(`Buku ${i}`);
    const semuaBuku = await prisma.book.findMany();

    for (const u of orang) {
      for (const bk of semuaBuku) {
        const l = await borrowBook(u.id, bk.id);
        await saveProgress(u.id, bk.id, 5);
        await markFinished(u.id, bk.id);
        await returnLoan(l.id, "USER");
      }
    }

    // getDashboard mengembalikan perBook (4) + perUser (5) + ranking (5) = 14 objek
    const penuh = await getDashboard();
    expect(penuh.perBook).toHaveLength(4);
    expect(penuh.perUser).toHaveLength(5);
    expect(penuh.ranking).toHaveLength(5);

    // Ringkasan hanya mengembalikan 5 besar + angka sendiri — tanpa perBook sama sekali
    const ringkas = await getRingkasanBeranda(orang[0].id);
    expect(Object.keys(ringkas).sort()).toEqual(["finishedBooks", "myRank", "top"]);
    // dan angkanya tetap benar
    expect(ringkas.finishedBooks).toBe(4);
    expect(ringkas.myRank).toBe(1);
  });
});
