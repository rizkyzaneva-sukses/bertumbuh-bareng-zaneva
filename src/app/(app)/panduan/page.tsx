import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { RENEW_LIMIT } from "@/lib/reading";
import { MAX_ACTIVE_LOANS } from "@/lib/loan-status";
import { LOAN_WORKING_DAYS } from "@/lib/dates";

export const metadata = { title: "Panduan" };

export default async function PanduanPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  return (
    <>
      <h1>Panduan 📘</h1>
      <p className="muted">Cara pakai Bertumbuh Bareng Zaneva — pinjam, baca, lanjut, dan balikin.</p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Ringkasnya</h2>
        <ul className="list">
          <li><b>Pinjam</b> maksimal {MAX_ACTIVE_LOANS} buku sekaligus, {LOAN_WORKING_DAYS} hari kerja (Ahad tidak dihitung).</li>
          <li><b>Tidak perlu balikin dulu</b> untuk memperpanjang — jatuh tempo digeser, maksimal {RENEW_LIMIT}×.</li>
          <li><b>Progres baca tersimpan</b> per buku, bukan per peminjaman. Kepotong pindah buku? Lanjut lagi kapan pun.</li>
          <li><b>Selesai</b> ditandai olehmu (klik di app, atau balas <code>1</code> di WA) — bukan otomatis saat buku dikembalikan.</li>
        </ul>
      </div>

      <h2>1. Meminjam buku</h2>
      <div className="card">
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li>Buka menu <b>Buku</b>.</li>
          <li>Cari judul/penulis, atau saring lewat kategori.</li>
          <li>Ketuk <b>Pinjam</b>. Jatuh tempo otomatis dihitung: 3 hari kerja, Ahad dilewati.</li>
        </ol>
        <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Slot penuh ({MAX_ACTIVE_LOANS} buku)? Kembalikan salah satu, atau perpanjang yang ada.
        </p>
      </div>

      <h2>2. Mencatat progres bacaan</h2>
      <div className="card">
        <p>Dua cara, pilih yang paling gampang buatmu:</p>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li>
            <b>Lewat app</b> — di <Link href="/">Beranda</Link> atau <Link href="/riwayat">Riwayat</Link>, isi
            &ldquo;Terakhir halaman&rdquo; lalu ketuk <b>Simpan</b>. Persentase langsung terlihat.
          </li>
          <li>
            <b>Lewat WhatsApp</b> — saat buku dikembalikan, kamu dapat pertanyaan:
            <div
              className="small"
              style={{
                background: "var(--bg2)",
                borderLeft: "3px solid var(--accent)",
                borderRadius: 8,
                padding: "10px 12px",
                margin: "8px 0",
                whiteSpace: "pre-line",
              }}
            >
              {`Beres bacanya?\nKetik 1 kalau sudah beres\nKetik 2 dan tuliskan halamannya kalau belum — contoh: 2 (50)`}
            </div>
            Balas <code>1</code> kalau tuntas, atau <code>2 (50)</code> kalau baru sampai halaman 50.
          </li>
        </ol>
        <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
          <b>Contoh cerita:</b> kamu baca Buku A sampai halaman 200, kepotong mau lanjut Buku B, lalu keburu Buku C.
          Semua tercatat sendiri-sendiri. Buka <Link href="/riwayat">Riwayat</Link> → bagian <b>Lanjutkan bacaan</b> →
          tinggal sambung dari halaman terakhir. Tidak ada yang hilang.
        </p>
      </div>

      <h2>3. Memperpanjang (tanpa balikin dulu)</h2>
      <div className="card">
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li>Buka <Link href="/riwayat">Riwayat</Link> (atau Beranda).</li>
          <li>Pada buku yang sedang dipinjam, ketuk <b>Perpanjang (sisa N×)</b>.</li>
          <li>Jatuh tempo digeser 3 hari kerja lagi. Buku tetap di tanganmu.</li>
        </ol>
        <p className="small" style={{ marginTop: 10 }}>
          <b>Kenapa kadang ditolak?</b> Kalau buku itu sedang ditunggu orang lain (semua eksemplar habis dipinjam),
          perpanjangan ditolak supaya adil — yang menunggu dapat giliran. Kamu perlu mengembalikannya dulu.
        </p>
        <p className="small" style={{ marginBottom: 0 }}>
          Batas: maksimal {RENEW_LIMIT}× per peminjaman. Setelah itu harus dikembalikan, nanti bisa pinjam lagi.
        </p>
      </div>

      <h2>4. Mengembalikan buku</h2>
      <div className="card">
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li>Ketuk <b>Balikin</b> di buku yang bersangkutan (Beranda atau Riwayat).</li>
          <li>Atau lewat link yang dikirim di WhatsApp saat jatuh tempo.</li>
          <li>Setelah tercatat kembali, kamu otomatis dapat pertanyaan <b>beres bacanya?</b> di WA.</li>
        </ol>
        <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Buku kembali ke rak <b>tidak sama dengan</b> selesai dibaca. Kalau kamu balas <code>2 (50)</code>, buku tetap
          tersedia untuk dipinjam orang lain, tapi bacaanmu tercatat sampai halaman 50 dan bisa dilanjutkan nanti.
        </p>
      </div>

      <h2>5. Baca di kantor (tanpa dibawa pulang)</h2>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Kamu tetap perlu <b>meminjam lewat app</b> supaya bukunya tercatat di tanganmu — walaupun dibacanya di tempat.
        </p>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li>Pinjam bukunya di menu <b>Buku</b>.</li>
          <li>Baca di kantor, catat halaman terakhir di app kapan pun.</li>
          <li>Kalau sudah tuntas, buka <Link href="/riwayat">Riwayat</Link> → ketuk <b>✓ Beres baca</b>. Selesai — tidak perlu menunggu balasan WA.</li>
          <li>Lalu kembalikan bukunya ke rak dan ketuk <b>Balikin</b>.</li>
        </ol>
        <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Tombol <b>Beres baca</b> juga bisa ditekan untuk buku yang <i>sudah</i> kamu kembalikan tapi lupa ditandai —
          ada di Riwayat bagian <b>Sudah dikembalikan</b>.
        </p>
      </div>

      <h2>6. Arti angka di Dashboard</h2>
      <div className="card">
        <ul className="list">
          <li><b>Judul buku</b> — jumlah judul di rak.</li>
          <li><b>Sedang dipinjam</b> — transaksi pinjaman yang belum kembali.</li>
          <li><b>Beres dibaca</b> — buku yang <b>kamu tandai selesai</b>, dari app maupun balasan WA <code>1</code>.</li>
          <li><b>Terlambat</b> — lewat jatuh tempo dan belum dikembalikan.</li>
        </ul>
        <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Ranking pembaca dihitung dari jumlah buku yang <b>beres dibaca</b>. Jadi kalau kamu balas{" "}
          <code>2 (50)</code>, buku itu belum masuk hitungan — dan itu memang adil.
        </p>
      </div>

      <h2>7. Usulkan buku &amp; notifikasi</h2>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Usul lewat WhatsApp</h3>
        <p className="muted small" style={{ margin: "0 0 8px" }}>
          Kirim ke nomor <b>Zaneva Official</b> dengan awalan <code>#usul</code>:
        </p>
        <pre style={{ background: "var(--bg2)", padding: 10, borderRadius: 10, fontSize: ".82rem", overflowX: "auto", margin: 0 }}>
{`#usul Atomic Habits
#usul Atomic Habits https://shopee.co.id/...`}
        </pre>
        <p className="muted small" style={{ margin: "8px 0 0" }}>
          Judul saja cukup. Link toko boleh ditambahkan di belakangnya — membantu admin cek harga &amp; edisi.
          Bot akan membalas bahwa usulanmu tercatat, dan kamu dikabari lagi kalau bukunya sudah masuk rak.
        </p>

        <h3>Usul dari dalam app</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Buka <b>Profil</b> → <b>💡 Usulkan buku</b>. Riwayat usulanmu terlihat di situ beserta statusnya
          (Baru / Dipertimbangkan / Sudah dibeli).
        </p>

        <h3>Notifikasi buku baru</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Buka <b>Profil</b> → <b>Notifikasi</b> → <b>Aktifkan notifikasi</b> → <b>Izinkan</b>.
          Setelah aktif, kamu dapat kabar di HP setiap ada buku baru — gratis, tanpa WA.
          <br />
          <b>iPhone:</b> wajib dipasang dulu lewat Safari → Bagikan → <b>Tambah ke Layar Utama</b> (iOS 16.4+).
        </p>
      </div>

      {isAdmin && (
        <>
          <h2>8. Khusus admin</h2>
          <div className="card">
            <ul className="list">
              <li><b>Tambah buku</b> — Profil → Panel admin → tab <b>Buku</b>. Kategori <b>wajib dipilih dari daftar</b>, jangan diketik bebas, supaya rak tidak pecah jadi puluhan label. Setiap buku baru otomatis memicu <b>notifikasi ke semua anggota</b>.</li>
              <li><b>Rekap usulan buku</b> — Panel admin → tab <b>Usulan</b>. Tekan <b>Sudah dibeli</b>, peminta otomatis dikabari lewat WA.</li>
              <li><b>Tambah anggota/admin</b> — Panel admin → tab <b>User</b> → form <b>Tambah pengguna</b>. Password sementara diberikan sistem, kirimkan ke orangnya.</li>
              <li><b>Catat kondisi buku</b> — saat menandai dikembalikan, pilih <i>Baik / Rusak ringan / Rusak berat / Hilang</i>. Hanya <b>Hilang</b> yang mengurangi stok; anggota tidak bisa mencatat rusak/hilang, itu khusus admin.</li>
              <li><b>Pantau keterlambatan</b> — Panel admin → tab <b>Pinjam</b>. Rekap harian juga dikirim ke WA admin sekali sehari.</li>
              <li><b>Halaman panduan ini</b> hanya butuh login, tidak perlu admin.</li>
            </ul>
            <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
              Catatan: pertanyaan WA &ldquo;beres bacanya?&rdquo; dan usulan <code>#usul</code> dibaca lewat <b>polling</b> ke sesi WAHA, bukan webhook —
              sesi <code>tehayu</code> sudah dipakai alur order gudang lewat n8n, jadi konfigurasinya sengaja tidak diubah.
            </p>
          </div>
        </>
      )}

      <h2>Masih bingung?</h2>
      <div className="card">
        <p style={{ margin: 0 }}>
          Tanya admin lewat WhatsApp. Sebutkan judul bukunya biar cepat ditelusuri.
        </p>
      </div>

      <h2>Bawa panduannya offline</h2>
      <div className="card">
        <p className="muted small" style={{ marginTop: 0 }}>
          Versi PDF bergambar — bisa dibuka tanpa internet, cocok dikirim ke teman yang baru gabung.
        </p>
        <a className="btn sm" href="/panduan.pdf" download data-testid="unduh-panduan">
          ⬇️ Unduh panduan (PDF)
        </a>
      </div>
    </>
  );
}
