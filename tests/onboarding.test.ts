import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { checkName, needsProfile, normName } from "@/lib/profile";
import { resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

/** Meniru alur endpoint /api/admin/users/invite: nama kosong -> wajib isi sendiri. */
async function createUser(opts: { phone: string; name?: string; role?: "ADMIN" | "MEMBER"; pw?: string }) {
  const pw = opts.pw ?? "Sementara1";
  return prisma.user.create({
    data: {
      name: opts.name ?? "",
      phone: opts.phone,
      passwordHash: await hashPassword(pw),
      tempPassword: pw,
      role: opts.role ?? "MEMBER",
      mustChangePassword: true,
    },
  });
}

/** Meniru alur /api/auth/change-password dengan nama sekaligus. */
async function completeOnboarding(userId: string, name: string, newPassword: string) {
  const checked = checkName(name);
  if (!checked.ok) return { ok: false as const, error: checked.reason };
  const u = await prisma.user.update({
    where: { id: userId },
    data: { name: checked.name, passwordHash: await hashPassword(newPassword), mustChangePassword: false, tempPassword: null },
  });
  return { ok: true as const, user: u };
}

describe("tambah pengguna", () => {
  it("admin baru tanpa nama wajib melengkapi profil", async () => {
    const u = await createUser({ phone: "6285177555437", role: "ADMIN" });
    expect(u.role).toBe("ADMIN");
    expect(u.name).toBe("");
    expect(u.tempPassword).toBe("Sementara1");
    expect(needsProfile(u)).toBe(true);
    expect(u.name.trim().length).toBe(0); // app tahu harus minta Nama
  });

  it("nomor yang sama tidak bisa didaftarkan dua kali", async () => {
    await createUser({ phone: "6285177555437" });
    await expect(createUser({ phone: "6285177555437" })).rejects.toBeTruthy();
  });

  it("nama yang diisi admin langsung dipakai", async () => {
    const u = await createUser({ phone: "6281234567890", name: "  Sinta   Dewi ", role: "MEMBER" });
    const checked = checkName(u.name);
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.name).toBe("Sinta Dewi");
  });
});

describe("onboarding nama + password", () => {
  it("sekali submit mengisi nama dan membuka akses", async () => {
    const u = await createUser({ phone: "6285177555437", role: "ADMIN" });
    expect(needsProfile(u)).toBe(true);

    const r = await completeOnboarding(u.id, "  Rizky   Maulana ", "Rahasia123");
    expect(r.ok).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.name).toBe("Rizky Maulana");
    expect(after.mustChangePassword).toBe(false);
    expect(after.tempPassword).toBeNull();
    expect(after.role).toBe("ADMIN"); // role tidak berubah
    expect(needsProfile(after)).toBe(false);
  });

  it("nama kosong ditolak, profil tetap terkunci", async () => {
    const u = await createUser({ phone: "6281234567000" });
    const r = await completeOnboarding(u.id, "   ", "Rahasia123");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("minimal");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.name).toBe("");
    expect(needsProfile(after)).toBe(true);
  });

  it("password lama tidak berlaku setelah onboarding", async () => {
    const u = await createUser({ phone: "6281234567001" });
    await completeOnboarding(u.id, "Budi Santoso", "Rahasia123");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.passwordHash).not.toBe(await hashPassword("Sementara1"));
    expect(after.tempPassword).toBeNull();
  });

  it("nama berlebih dirapikan, bukan ditolak", async () => {
    const u = await createUser({ phone: "6281234567002" });
    const r = await completeOnboarding(u.id, "   Siti   Aminah   ", "Rahasia123");
    expect(r.ok).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).name).toBe("Siti Aminah");
  });
});

describe("tampilan nama pengguna", () => {
  /** Aturan tampilan: kalau nama belum diisi, pakai nomor HP sebagai gantinya. */
  const label = (name: string, phone: string) => name.trim() || "0" + phone.slice(2);

  it("pakai nomor HP selama nama kosong", () => {
    expect(label("", "6285177555437")).toBe("085177555437");
    expect(label("   ", "6285177555437")).toBe("085177555437");
  });

  it("pakai nama begitu sudah diisi", () => {
    expect(label("Sinta Dewi", "6285177555437")).toBe("Sinta Dewi");
  });

  it("normName konsisten dengan aturan tampilan", () => {
    expect(normName("  A  B  ")).toBe("A B");
  });
});

let _unused: Awaited<ReturnType<typeof hashPassword>> | null = null;
beforeAll(async () => {
  _unused = await hashPassword("warmup"); // panaskan bcrypt sebelum test, biar tidak lambat
});
