import { describe, expect, it } from "vitest";
import { addDays, computeDueDate, dayOfWeek, diffDays, formatTanggal, jakartaHour, jakartaKey } from "@/lib/dates";

// 2026-11-16 = Senin
describe("computeDueDate (3 hari kerja, Ahad tidak dihitung)", () => {
  const cases: [string, string, string][] = [
    ["2026-11-16", "2026-11-19", "Senin -> Kamis"],
    ["2026-11-17", "2026-11-20", "Selasa -> Jumat"],
    ["2026-11-18", "2026-11-21", "Rabu -> Sabtu (Sabtu dihitung)"],
    ["2026-11-19", "2026-11-23", "Kamis -> Senin (lewati Ahad)"],
    ["2026-11-20", "2026-11-24", "Jumat -> Selasa (lewati Ahad)"],
    ["2026-11-21", "2026-11-25", "Sabtu -> Rabu (lewati Ahad)"],
    ["2026-11-22", "2026-11-25", "Ahad -> Rabu (hari pinjam Ahad tidak dihitung)"],
  ];
  for (const [from, to, label] of cases) it(label, () => expect(computeDueDate(from)).toBe(to));

  it("tidak pernah jatuh di hari Ahad", () => {
    for (let i = 0; i < 400; i++) expect(dayOfWeek(computeDueDate(addDays("2026-01-01", i)))).not.toBe(0);
  });
  it("melewati pergantian bulan/tahun", () => {
    expect(computeDueDate("2026-12-30")).toBe("2027-01-02"); // Rabu -> Sabtu
    expect(computeDueDate("2026-12-31")).toBe("2027-01-04"); // Kamis -> Senin
  });
  it("jumlah hari kerja bisa diatur", () => expect(computeDueDate("2026-11-16", 1)).toBe("2026-11-17"));
});

describe("zona waktu WIB", () => {
  it("23.30 UTC sudah hari berikutnya di WIB", () => {
    expect(jakartaKey(new Date("2026-11-18T18:00:00Z"))).toBe("2026-11-19");
    expect(jakartaKey(new Date("2026-11-18T16:59:00Z"))).toBe("2026-11-18");
  });
  it("jam WIB", () => expect(jakartaHour(new Date("2026-11-19T01:30:00Z"))).toBe(8));
  it("helper", () => {
    expect(diffDays("2026-11-19", "2026-11-23")).toBe(4);
    expect(formatTanggal("2026-11-19")).toBe("Kamis, 19 November 2026");
  });
});
