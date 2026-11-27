import { getTodayReading } from "@/lib/reading";
import { formatTanggalPendek } from "@/lib/dates";
import { Stat } from "@/components/ui";
import { displayPhone } from "@/lib/phone";
import { KirimWaBelumBaca } from "@/components/KirimWaBelumBaca";

export const metadata = { title: "Admin · Baca Hari Ini" };
export const dynamic = "force-dynamic";

/**
 * Rekap baca HARI INI — jawaban langsung untuk pertanyaan Bos:
 * *"di dashboard admin terlihat si A hari ini baca berapa halaman dan bukunya
 * apa"*.
 *
 * Dua kelompok, urutannya sengaja "belum baca" di ATAS: yang perlu ditindak
 * adalah yang belum, bukan yang sudah. Yang belum baca ditampilkan lengkap
 * dengan nomor HP + tombol kirim WA, karena Bos minta *"yg belum baca itu wajib
 * list orangnya"*.
 */
export default async function AdminHariIni() {
  const d = await getTodayReading();
  const sudah = d.readers.filter((r) => r.status === "SUDAH");
  const belum = d.readers.filter((r) => r.status === "BELUM");

  return (
    <>
      <h2>Baca hari ini · {formatTanggalPendek(d.dayKey)}</h2>

      <div className="grid cols2 cols4" style={{ marginBottom: 14 }}>
        <Stat n={sudah.length} label="Sudah baca" />
        <Stat n={belum.length} label="Belum baca" />
        <Stat n={d.totalHalaman} label="Total halaman" />
        <Stat n={d.readers.length} label="Karyawan" />
      </div>

      {/* ── BELUM BACA — ditaruh paling atas, ini yang perlu ditindak ── */}
      <div className="card" data-testid="belum-baca">
        <div className="row between">
          <h3 style={{ margin: 0 }}>⚠️ Belum baca hari ini ({belum.length})</h3>
        </div>
        {belum.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Semua karyawan sudah membaca hari ini. 🎉
          </p>
        ) : (
          <>
            <p className="muted small" style={{ marginTop: 4 }}>
              Belum ada halaman tercatat hari ini. Kirim pengingat lewat WhatsApp sekaligus, atau satu per satu.
            </p>
            <div style={{ marginBottom: 10 }}>
              <KirimWaBelumBaca nama={belum.map((r) => r.name)} />
            </div>
            <ul className="list">
              {belum.map((r) => (
                <li key={r.userId} className="row" data-testid="row-belum">
                  <span style={{ flex: 1 }}>
                    <b>{r.name}</b>
                    <span className="small muted"> · {displayPhone(r.phone)}</span>
                  </span>
                  <span className="chip red">0 hlm</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* ── SUDAH BACA — siapa, berapa halaman, buku apa ── */}
      <div className="card" data-testid="sudah-baca" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>✅ Sudah baca hari ini ({sudah.length})</h3>
        {sudah.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Belum ada yang mencatat bacaan hari ini.</p>
        ) : (
          <ul className="list">
            {sudah.map((r) => (
              <li key={r.userId} data-testid="row-sudah">
                <div className="row between">
                  <b>{r.name}</b>
                  <span className="chip green">{r.totalPages} halaman</span>
                </div>
                <ul className="list" style={{ marginTop: 4 }}>
                  {r.books.map((b) => (
                    <li key={b.bookId} className="small">
                      📖 <b>{b.title}</b>
                      <span className="muted">
                        {" "}— {b.pagesRead} hlm
                        {b.totalPages ? ` · sampai hlm ${b.lastPage}/${b.totalPages}` : ` · sampai hlm ${b.lastPage}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
