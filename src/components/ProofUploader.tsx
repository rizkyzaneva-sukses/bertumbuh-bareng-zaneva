"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { kompresFoto, ukuranRingkas, PROOF_MAX_SIDE } from "@/lib/proof-image";

/**
 * Tombol "Foto bukti" setelah buku dikembalikan.
 *
 * Bos: *"Bukti pengembalian bukunya gimana ya bro"* → *"Difoto bisa ga? Tp image
 * ini harus kepress biar aman ga menuhin space."*
 *
 * Alur: pilih kamera → foto dikompres DI HP (1200px, JPEG 0,72) → unggah.
 * Yang naik ke jaringan ~130 KB, bukan 1,8 MB. Foto ulang mengganti yang lama,
 * jadi tidak ada berkas menumpuk.
 */
export function ProofUploader({
  loanId,
  adaBuktiAwal = false,
  ukuranAwal,
}: {
  loanId: string;
  adaBuktiAwal?: boolean;
  ukuranAwal?: number | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [adaBukti, setAdaBukti] = useState(adaBuktiAwal);
  const [sibuk, setSibuk] = useState(false);
  const [tahap, setTahap] = useState("");
  const [pesan, setPesan] = useState<{ ok: boolean; t: string } | null>(null);
  const [ukuran, setUkuran] = useState<number | null>(ukuranAwal ?? null);
  const [versi, setVersi] = useState(0);

  async function pilih(file: File) {
    setPesan(null);
    setSibuk(true);
    try {
      setTahap("Mengompres foto…");
      const { blob, width, height, nama } = await kompresFoto(file);

      setTahap("Mengunggah…");
      const fd = new FormData();
      fd.append("file", new File([blob], nama, { type: "image/jpeg" }));
      fd.append("width", String(width));
      fd.append("height", String(height));

      const res = await fetch(`/api/loans/${loanId}/proof`, { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; sizeBytes?: number };
      if (!res.ok || !body.ok) {
        setPesan({ ok: false, t: body.error ?? "Gagal mengunggah foto." });
        return;
      }
      setAdaBukti(true);
      setUkuran(body.sizeBytes ?? blob.size);
      setVersi((v) => v + 1);
      setPesan({ ok: true, t: `Bukti tersimpan (${ukuranRingkas(body.sizeBytes ?? blob.size)}).` });
      router.refresh();
    } catch (e) {
      setPesan({ ok: false, t: String((e as Error).message ?? e) });
    } finally {
      setSibuk(false);
      setTahap("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div data-testid="proof-uploader">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pilih(f);
        }}
        data-testid="proof-input"
      />

      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          className="btn sm ghost"
          disabled={sibuk}
          onClick={() => inputRef.current?.click()}
          data-testid="proof-pick"
        >
          {sibuk ? tahap || "…" : adaBukti ? "📷 Ganti foto bukti" : "📷 Foto bukti"}
        </button>
        {adaBukti && (
          <a
            className="btn sm ghost"
            href={`/api/loans/${loanId}/proof?v=${versi}`}
            target="_blank"
            rel="noreferrer"
            data-testid="proof-lihat"
          >
            Lihat
          </a>
        )}
        {ukuran ? <span className="small muted">{ukuranRingkas(ukuran)}</span> : null}
      </div>

      {!adaBukti && !sibuk && (
        <p className="small muted" style={{ margin: "6px 0 0" }}>
          Foto buku yang sudah kamu taruh di rak. Otomatis dikecilkan ke {PROOF_MAX_SIDE}px
          supaya hemat kuota — tidak perlu diatur manual.
        </p>
      )}
      {pesan && (
        <div className={pesan.ok ? "ok" : "err"} role="status" style={{ marginTop: 6 }}>
          {pesan.t}
        </div>
      )}
    </div>
  );
}
