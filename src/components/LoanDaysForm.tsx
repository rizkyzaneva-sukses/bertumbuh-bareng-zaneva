"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
// Konstanta murni (tanpa Prisma) — file `settings.ts` menyentuh database dan
// tidak boleh masuk bundel browser.
import { LOAN_DAYS_MAX, LOAN_DAYS_MIN } from "@/lib/loan-rules";

/**
 * Pengaturan lama pinjam di menu Profil — khusus admin.
 *
 * Bos: *"Untuk waktunya bisa jadi buat flexibel di menu profile ga? Saya mau
 * settingan default jadi 7 hari, jadi takutnya nanti ada kebijakan berubah."*
 *
 * Karena itu bentuknya angka + tombol simpan, bukan tulis ulang kode. Ada
 * pratinjau "contoh: pinjam hari ini → tempo ..." supaya admin tahu akibatnya
 * sebelum menyimpan, tanpa harus menghitung hari kerja sendiri.
 */
export function LoanDaysForm({ awal }: { awal: number }) {
  const router = useRouter();
  const [hari, setHari] = useState(awal);
  const [sibuk, setSibuk] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const berubah = hari !== awal;

  async function simpan() {
    setSibuk(true);
    setMsg(null);
    const r = await api<{ hari?: number }>("/api/settings/loan-days", "POST", { hari });
    setSibuk(false);
    if (!r.ok) return setMsg({ ok: false, t: r.error ?? "Gagal menyimpan." });
    setMsg({ ok: true, t: `Tersimpan. Peminjaman baru: ${r.hari ?? hari} hari kerja.` });
    router.refresh();
  }

  return (
    <div>
      <div className="row" style={{ alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <div className="field" style={{ margin: 0, width: 120, flex: "none" }}>
          <label htmlFor="loan-days">Lama pinjam</label>
          <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
            <input
              id="loan-days"
              type="number"
              inputMode="numeric"
              min={LOAN_DAYS_MIN}
              max={LOAN_DAYS_MAX}
              value={hari}
              onChange={(e) => setHari(Math.trunc(Number(e.target.value)) || LOAN_DAYS_MIN)}
              style={{ width: 70 }}
              data-testid="loan-days"
            />
            <span className="muted small" style={{ alignSelf: "center" }}>hari</span>
          </div>
        </div>
        <button className="btn" disabled={sibuk || !berubah} onClick={simpan} data-testid="simpan-lama-pinjam">
          {sibuk ? "…" : berubah ? "Simpan" : "Tersimpan"}
        </button>
        {berubah && (
          <button className="btn ghost" disabled={sibuk} onClick={() => { setHari(awal); setMsg(null); }}>
            Batal
          </button>
        )}
      </div>

      <p className="muted small" style={{ margin: "8px 0 0" }}>
        {awal} hari <b>kerja</b> — hari Ahad tidak dihitung, jadi buku tidak pernah jatuh tempo di hari Ahad.
        Batas {LOAN_DAYS_MIN}–{LOAN_DAYS_MAX} hari. Berlaku untuk peminjaman &amp; perpanjangan berikutnya;
        pinjaman yang sedang berjalan tidak berubah.
      </p>

      {msg && <div className={msg.ok ? "ok" : "err"} role="status" style={{ marginTop: 8 }}>{msg.t}</div>}
    </div>
  );
}
