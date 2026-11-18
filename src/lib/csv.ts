import { normalizePhone } from "./phone";

export type ParsedUserRow = { name: string; phone: string };
export type ParseResult = {
  rows: ParsedUserRow[];
  errors: { line: number; text: string; reason: string }[];
};

function splitLine(line: string): string[] {
  // dukung koma, titik koma, tab, dan CSV dengan tanda kutip sederhana
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  const delim = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (c === delim && !inQ) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Parse teks tempelan / isi CSV: tiap baris "nama, nomor HP" (urutan boleh terbalik). */
export function parseUserList(text: string): ParseResult {
  const rows: ParsedUserRow[] = [];
  const errors: ParseResult["errors"] = [];
  const seen = new Set<string>();
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    const cells = splitLine(line).filter((c) => c !== "");
    if (cells.length < 2) {
      // header / baris rusak
      errors.push({ line: idx + 1, text: line, reason: "Harus ada nama dan nomor HP" });
      return;
    }
    const lower = cells.map((c) => c.toLowerCase());
    if (idx === 0 && lower.some((c) => /^(nama|name)$/.test(c)) && lower.some((c) => /^(hp|phone|nomor|no hp|no\.? ?hp|telepon|wa)/.test(c))) {
      return; // baris header, abaikan
    }
    let phone: string | null = null;
    let name = "";
    for (let i = 0; i < cells.length; i++) {
      const p = /\d{8,}/.test(cells[i].replace(/[\s\-+]/g, "")) && !/[a-zA-Z]{2,}/.test(cells[i]) ? normalizePhone(cells[i]) : null;
      if (p && !phone) phone = p;
      else if (!name) name = cells[i];
    }
    if (!phone) return void errors.push({ line: idx + 1, text: line, reason: "Nomor HP tidak valid" });
    if (!name) return void errors.push({ line: idx + 1, text: line, reason: "Nama kosong" });
    if (seen.has(phone)) return void errors.push({ line: idx + 1, text: line, reason: "Nomor dobel di daftar" });
    seen.add(phone);
    rows.push({ name: name.slice(0, 80), phone });
  });
  return { rows, errors };
}
