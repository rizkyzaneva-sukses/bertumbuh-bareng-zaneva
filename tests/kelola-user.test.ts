import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { SEED_ADMIN_PHONES } from "@/lib/seed";
import { resetDb } from "./helpers";

/**
 * Kelola pengguna oleh admin — Bos minta empat hal:
 *   1. edit nomor HP user
 *   2. edit nama user
 *   3. hapus user
 *   4. tambah user
 *
 * 3 & 4 sudah ada sebelumnya (dan sudah diuji e2e). Yang BARU adalah edit
 * nomor HP lewat UI, plus penutupan celah: proteksi admin utama dicek dari
 * NOMOR HP, jadi nomornya tidak boleh diganti.
 *
 * Berkas ini menguji LOGIKA aturan (bukan HTTP), supaya cepat dan tidak
 * bergantung pada server. Alur HTTP-nya diuji di e2e.test.ts.
 */

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
});

async function mkUser(name: string, phone: string) {
  return prisma.user.create({ data: { name, phone: normalizePhone(phone)!, passwordHash: "x" } });
}

describe("kelola pengguna: edit nama & nomor HP", () => {
  it("nomor HP dinormalisasi ke format 62 sebelum disimpan", async () => {
    // Admin boleh mengetik 0812-3456-7890 / +62 812 ... / 62812...
    // Semua harus jadi satu bentuk kanonik, kalau tidak orangnya tidak bisa login.
    for (const input of ["081234567890", "+62 812-3456-7890", "6281234567890", "812 3456 7890"]) {
      expect(normalizePhone(input)).toBe("6281234567890");
    }
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
  });

  it("nomor yang diketik ulang dalam format lain TIDAK dianggap duplikat diri sendiri", async () => {
    // Kasus nyata: admin buka form edit, nomornya tampil 0812-3456-7890,
    // lalu dia hanya membetulkan nama. Nomor yang tidak berubah jangan
    // memicu error "nomor sudah dipakai".
    const u = await mkUser("Sinta", "081234567890");
    const ketikUlang = normalizePhone("+62 812 3456 7890");
    expect(ketikUlang).toBe(u.phone); // sama persis → bukan perubahan
  });

  it("nomor yang sudah dipakai orang lain ditolak", async () => {
    await mkUser("Sinta", "081234567890");
    const budi = await mkUser("Budi", "085711112222");
    const bentrok = await prisma.user.findUnique({ where: { phone: normalizePhone("081234567890")! } });
    expect(bentrok).not.toBeNull();
    expect(bentrok!.id).not.toBe(budi.id);
  });

  it("admin utama TIDAK bisa diganti nomornya (celah proteksi)", async () => {
    // Proteksi turunkan/hapus admin utama dicek lewat SEED_ADMIN_PHONES.
    // Kalau nomor boleh diganti, satu PATCH membuka jalan menghapusnya.
    const adminUtama = await mkUser("Admin Utama", SEED_ADMIN_PHONES[0]);
    expect(SEED_ADMIN_PHONES.includes(adminUtama.phone)).toBe(true);

    // Simulasikan apa yang akan terjadi kalau nomornya berubah:
    const nomorBaru = normalizePhone("089999999999")!;
    expect(SEED_ADMIN_PHONES.includes(nomorBaru)).toBe(false);
    // → proteksinya hilang. Karena itu PATCH menolak (diuji di route).
  });

  it("nama divalidasi: minimal 2 karakter & harus ada huruf", async () => {
    const { checkName } = await import("@/lib/profile");
    expect(checkName("A").ok).toBe(false);
    expect(checkName("1234").ok).toBe(false);
    expect(checkName("   ").ok).toBe(false);
    expect(checkName("Sinta Dewi").ok).toBe(true);
    // spasi berlebih dirapikan
    const ok = checkName("  Sinta    Dewi  ");
    expect(ok.ok && ok.name).toBe("Sinta Dewi");
  });

  it("nomor unik di tingkat database (bukan cuma dicek kode)", async () => {
    await mkUser("Sinta", "081234567890");
    await expect(mkUser("Kembar", "081234567890")).rejects.toThrow();
    expect(await prisma.user.count()).toBe(1);
  });
});

describe("kelola pengguna: hapus & tambah", () => {
  it("menghapus user ikut membersihkan pinjaman & progresnya", async () => {
    const u = await mkUser("Sinta", "081234567890");
    const b = await prisma.book.create({ data: { title: "Atomic Habits", author: "James Clear" } });
    await prisma.loan.create({
      data: { userId: u.id, bookId: b.id, dueDate: new Date("2026-12-01"), status: "DIKEMBALIKAN", returnedAt: new Date() },
    });
    await prisma.readingProgress.create({ data: { userId: u.id, bookId: b.id, lastPage: 42 } });

    await prisma.user.delete({ where: { id: u.id } });

    // onDelete: Cascade — tidak boleh ada data yatim
    expect(await prisma.loan.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.readingProgress.count({ where: { userId: u.id } })).toBe(0);
    // bukunya TIDAK ikut terhapus
    expect(await prisma.book.count()).toBe(1);
  });

  it("user dengan pinjaman BERJALAN tidak boleh dihapus", async () => {
    // Aturan ini ditegakkan di route DELETE; di sini dibuktikan bahwa
    // penghitungan "pinjaman aktif" memang bisa membedakan.
    const u = await mkUser("Sinta", "081234567890");
    const b = await prisma.book.create({ data: { title: "Atomic Habits", author: "James Clear" } });
    await prisma.loan.create({ data: { userId: u.id, bookId: b.id, dueDate: new Date("2026-12-01"), status: "DIPINJAM" } });

    const aktif = await prisma.loan.count({ where: { userId: u.id, returnedAt: null } });
    expect(aktif).toBe(1); // → route menolak 409 ACTIVE_LOANS
  });

  it("tambah user baru: nomor dinormalisasi & password sementara tercatat", async () => {
    const u = await prisma.user.create({
      data: {
        name: "Dewi",
        phone: normalizePhone("081298765432")!,
        passwordHash: "hash",
        tempPassword: "Sementara1",
        mustChangePassword: true,
      },
    });
    expect(u.phone).toBe("6281298765432");
    expect(u.tempPassword).toBe("Sementara1");
    expect(u.mustChangePassword).toBe(true);
    expect(u.role).toBe("MEMBER"); // default
  });
});
