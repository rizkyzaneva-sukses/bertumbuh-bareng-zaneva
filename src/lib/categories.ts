/**
 * Kategori baku perpustakaan.
 *
 * Katalog Excel aslinya punya 33 label sangat spesifik ("Fokus & prioritas",
 * "Diferensiasi merek", …) yang membuat filter rak tidak berguna. Semua label
 * dipetakan ke daftar pendek di bawah ini; admin memilih dari daftar ini juga
 * sehingga rak tidak pecah lagi jadi puluhan kategori.
 */
export const CATEGORIES = [
  "Produktivitas",
  "Berpikir & Kreativitas",
  "Kepemimpinan & Tim",
  "Pemasaran & Pelanggan",
  "Operasional",
  "Bisnis & Strategi",
  "Keuangan",
  "Spiritual",
  "Fiksi",
  "Komik",
  "Biografi",
  "Lainnya",
] as const;

export type Category = (typeof CATEGORIES)[number];

const RULES: Array<[Category, string[]]> = [
  ["Produktivitas", ["produktivitas", "fokus", "waktu", "kebiasaan", "prioritas", "disiplin"]],
  ["Berpikir & Kreativitas", ["kreatif", "berpikir", "kritis", "inovasi", "teknik berpikir"]],
  ["Kepemimpinan & Tim", ["kepemimpinan", "tim", "manajemen tim"]],
  [
    "Pemasaran & Pelanggan",
    ["pemasaran", "merek", "ritel", "pertumbuhan", "pelanggan", "komunikasi", "negosiasi", "pesan merek", "periklanan", "kanal"],
  ],
  ["Operasional", ["operasional", "proses", "efisiensi", "kualitas", "hambatan"]],
  ["Bisnis & Strategi", ["strategi", "bisnis", "riset", "eksperimen"]],
  ["Keuangan", ["keuangan", "finansial", "investasi", "uang"]],
  ["Spiritual", ["spiritual", "agama", "islam", "quran", "qur'an", "tauhid", "akhlak"]],
  ["Fiksi", ["fiksi", "novel", "cerita", "sastra"]],
  ["Komik", ["komik", "manga", "graphic novel"]],
  ["Biografi", ["biografi", "autobiografi", "biography", "memoar"]],
];

/** Petakan label lama/bebas ke salah satu kategori baku. */
export function normalizeCategory(raw: string | null | undefined): Category {
  const c = (raw ?? "").toLowerCase().trim();
  if (!c) return "Lainnya";
  const exact = CATEGORIES.find((x) => x.toLowerCase() === c);
  if (exact) return exact;
  for (const [cat, keys] of RULES) {
    if (keys.some((k) => c.includes(k))) return cat;
  }
  return "Lainnya";
}

/** Kategori yang benar-benar dipakai buku di rak (untuk filter), urut sesuai CATEGORIES. */
export function categoriesInUse(used: Iterable<string>): string[] {
  const set = new Set(Array.from(used).filter(Boolean));
  const ordered = CATEGORIES.filter((c) => set.has(c)) as string[];
  const extra = [...set].filter((c) => !(CATEGORIES as readonly string[]).includes(c)).sort();
  return [...ordered, ...extra];
}
