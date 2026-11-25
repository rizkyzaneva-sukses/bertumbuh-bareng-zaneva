import { describe, expect, it } from "vitest";
import { addDays, computeDueDate, computeLoanDueDate, dayOfWeek, diffDays, formatTanggal, jakartaHour, jakartaKey } from "@/lib/dates";
import { clampLoanDays, LOAN_COUNT_FROM_SEED, LOAN_DAYS_MAX, LOAN_DAYS_MIN, LOAN_WORKING_DAYS_DEFAULT } from "@/lib/loan-rules";

// 2026-11-16 = Senin
describe("computeDueDate (hari kerja, Ahad tidak dihitung)", () => {
  const cases: [string, string, string][] = [
    ["2026-11-16", "2026-11-19", "Senin -> Kamis (3 hari kerja)"],
    ["2026-11-17", "2026-11-20", "Selasa -> Jumat"],
    ["2026-11-18", "2026-11-21", "Rabu -> Sabtu (Sabtu dihitung)"],
    ["2026-11-19", "2026-11-23", "Kamis -> Senin (lewati Ahad)"],
    ["2026-11-20", "2026-11-24", "Jumat -> Selasa (lewati Ahad)"],
    ["2026-11-21", "2026-11-25", "Sabtu -> Rabu (lewati Ahad)"],
    ["2026-11-22", "2026-11-25", "Ahad -> Rabu (hari pinjam Ahad tidak dihitung)"],
  ];
  for (const [from, to, label] of cases) it(label, () => expect(computeDueDate(from, 3)).toBe(to));

  it("default 7 hari kerja: Senin -> Selasa pekan berikutnya", () => {
    // 16 Nov (Senin) + 7 hari kerja = 24 Nov (Selasa).
    // Hitung: 17,18,19,20,21 = 5 · Ahad 22 dilewati · 23,24 = 7.
    expect(computeDueDate("2026-11-16", LOAN_WORKING_DAYS_DEFAULT)).toBe("2026-11-24");
  });

  it("7 hari kerja: Kamis -> Jumat pekan berikutnya", () => {
    // 19 Nov (Kamis) + 7 hari kerja = 27 Nov (Jumat).
    expect(computeDueDate("2026-11-19", 7)).toBe("2026-11-27");
  });

  it("tidak pernah jatuh di hari Ahad", () => {
    for (const days of [1, 3, 5, 7, 14, 30]) {
      for (let i = 0; i < 400; i++) expect(dayOfWeek(computeDueDate(addDays("2026-01-01", i), days))).not.toBe(0);
    }
  });
  it("melewati pergantian bulan/tahun", () => {
    expect(computeDueDate("2026-12-30", 3)).toBe("2027-01-02"); // Rabu -> Sabtu
    expect(computeDueDate("2026-12-31", 3)).toBe("2027-01-04"); // Kamis -> Senin
  });
  it("jumlah hari kerja bisa diatur", () => expect(computeDueDate("2026-11-16", 1)).toBe("2026-11-17"));
});

describe("computeLoanDueDate (jangkar tanggal launch 27 Nov 2026)", () => {
  // 7 hari kerja mulai Jumat 27 Nov 2026 = Jumat 4 Des 2026.
  // Hitung: 28 (Sabtu)=2 · Ahad 29 dilewati · 30=3 · 1=4 · 2=5 · 3=6 · 4 Des=7.
  const TEMPO_LAUNCH = "2026-12-04";
  const A = LOAN_COUNT_FROM_SEED;

  it("hari pertama yang dihitung = tanggal launch (27 Nov)", () => {
    expect(dayOfWeek(A)).toBe(5); // Jumat
    expect(computeLoanDueDate(A, 7, A)).toBe(TEMPO_LAUNCH);
  });

  it("pinjaman SEBELUM launch ikut dihitung mulai Jumat, bukan dari hari pinjam", () => {
    // Kasus nyata: 3 pinjaman dibuat 25 Nov pukul 00.56-01.03 dapat tempo 28 Nov
    // (3 hari) — terlalu pendek. Semua harus jadi 4 Des.
    for (const borrow of ["2026-11-24", "2026-11-25", "2026-11-26"]) {
      expect(computeLoanDueDate(borrow, 7, A)).toBe(TEMPO_LAUNCH);
    }
  });

  it("tidak pernah jatuh di hari Ahad", () => {
    for (const borrow of ["2026-11-01", "2026-11-20", "2026-11-24", "2026-11-26"]) {
      expect(dayOfWeek(computeLoanDueDate(borrow, 7, A))).not.toBe(0);
    }
  });

  it("SETELAH launch perilakunya sama persis dengan aturan biasa", () => {
    // Jangkar tidak boleh mengubah apa pun setelah tanggalnya lewat.
    for (const borrow of ["2026-11-28", "2026-12-01", "2027-03-15"]) {
      expect(computeLoanDueDate(borrow, 7, A)).toBe(computeDueDate(borrow, 7));
    }
  });

  it("tanpa jangkar (anchor null) = aturan biasa, tidak ada yang digeser", () => {
    for (const borrow of ["2026-11-20", "2026-11-27", "2026-12-01"]) {
      expect(computeLoanDueDate(borrow, 7, null)).toBe(computeDueDate(borrow, 7));
    }
  });

  it("lama pinjam lain tetap dihormati saat sebelum launch", () => {
    // 3 hari kerja dihitung mulai Jumat 27: Sabtu 28 = 2, Ahad 29 dilewati,
    // Senin 30 = 3. Jadi tempo 30 Nov (bukan 2 Des).
    expect(computeLoanDueDate("2026-11-20", 3, A)).toBe("2026-11-30");
    // 1 hari kerja: hari pertama = Jumat 27 itu sendiri.
    expect(computeLoanDueDate("2026-11-20", 1, A)).toBe("2026-11-27");
  });
});

describe("clampLoanDays (batas setting lama pinjam)", () => {
  it("nilai sah diteruskan apa adanya", () => {
    expect(clampLoanDays(7)).toBe(7);
    expect(clampLoanDays("14")).toBe(14);
    expect(clampLoanDays(1)).toBe(1);
  });
  it("di luar batas dijepit, bukan error", () => {
    expect(clampLoanDays(0)).toBe(LOAN_DAYS_MIN);
    expect(clampLoanDays(-5)).toBe(LOAN_DAYS_MIN);
    expect(clampLoanDays(999)).toBe(LOAN_DAYS_MAX);
  });
  it("sampah / kosong jatuh ke default 7", () => {
    expect(clampLoanDays("abc")).toBe(LOAN_WORKING_DAYS_DEFAULT);
    expect(clampLoanDays(null)).toBe(LOAN_WORKING_DAYS_DEFAULT);
    expect(clampLoanDays(undefined)).toBe(LOAN_WORKING_DAYS_DEFAULT);
    expect(clampLoanDays(NaN)).toBe(LOAN_WORKING_DAYS_DEFAULT);
  });
  it("pecahan dibulatkan ke bawah", () => expect(clampLoanDays(7.9)).toBe(7));
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
