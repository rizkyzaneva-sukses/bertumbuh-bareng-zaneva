import { describe, expect, it } from "vitest";
import { checkName, NAME_MIN, needsProfile, normName } from "@/lib/profile";

describe("needsProfile", () => {
  it("wajib dilengkapi kalau nama kosong", () => {
    expect(needsProfile({ name: "", mustChangePassword: false })).toBe(true);
    expect(needsProfile({ name: "   ", mustChangePassword: false })).toBe(true);
    expect(needsProfile({ name: null, mustChangePassword: false })).toBe(true);
  });

  it("wajib dilengkapi kalau masih pakai password sementara", () => {
    expect(needsProfile({ name: "Sinta", mustChangePassword: true })).toBe(true);
  });

  it("selesai kalau nama ada dan password sudah diganti", () => {
    expect(needsProfile({ name: "Sinta Dewi", mustChangePassword: false })).toBe(false);
  });
});

describe("normName", () => {
  it("merapikan spasi berlebih", () => {
    expect(normName("  Sinta   Dewi  ")).toBe("Sinta Dewi");
  });
  it("membatasi 80 karakter", () => {
    expect(normName("a".repeat(120)).length).toBe(80);
  });
});

describe("checkName", () => {
  it("menerima nama wajar", () => {
    expect(checkName("Sinta Dewi")).toEqual({ ok: true, name: "Sinta Dewi" });
  });
  it("menolak nama terlalu pendek", () => {
    const r = checkName(" A ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(`minimal ${NAME_MIN}`);
  });
  it("menolak nama tanpa huruf", () => {
    const r = checkName("12345");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("huruf");
  });
  it("menerima huruf Arab", () => {
    expect(checkName("عائشة").ok).toBe(true);
  });
  it("menolak kosong", () => {
    expect(checkName("").ok).toBe(false);
    expect(checkName("   ").ok).toBe(false);
  });
});
