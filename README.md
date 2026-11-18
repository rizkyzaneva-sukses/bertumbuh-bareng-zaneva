# 📚 Bertumbuh Bareng Zaneva

Aplikasi web (PWA) perpustakaan buku untuk tim **ZANEVA**: anggota pinjam buku dari rak, admin mengelola buku dan anggota, dan pengingat jatuh tempo dikirim lewat WhatsApp (WAHA).

Seluruh tampilan berbahasa Indonesia, mobile-first, ada mode terang dan gelap, dan bisa dipasang ke layar utama (Android dan iPhone).

## Fitur

| Area | Isi |
|---|---|
| **Login** | Username = nomor HP (08xx / 62xx / +62 otomatis dirapikan). Admin mendaftarkan anggota massal (tempel daftar atau unggah CSV). Selama password masih sementara, muncul **popup wajib ganti password** di setiap halaman dan tidak bisa ditutup. Admin bisa reset password anggota kembali ke password sementara. |
| **Admin** | 081220210193 (Rizky) dan 085177555437 (orang kepercayaan) otomatis jadi admin. Admin bisa tambah, edit, hapus buku, kelola pengguna (lihat password sementara, reset, ubah nama, jadikan admin, hapus), menandai buku dikembalikan, dan melihat semua pinjaman serta riwayat pengingat WA. |
| **Pinjam** | Maksimal **2 buku aktif** per orang. Lama pinjam **3 hari kerja, hari Ahad tidak dihitung** (Sabtu dihitung). Status: dipinjam, terlambat, dikembalikan. Satu judul bisa punya banyak eksemplar (stok). |
| **Pengingat WA** | Lewat WAHA. Di **hari jatuh tempo (sekitar 08.00 WIB)** dikirim pesan pertama berisi **link sekali pakai** ke halaman dengan tombol “Balikin sekarang”. Sesudah itu, tiap hari dikirim **teks polos tanpa link atau tombol** (supaya nomor WA aman dari risiko diblokir) sampai bukunya dikembalikan. Hari Ahad dilewati. Pinjam lagi = pola mulai dari awal. |
| **Dashboard** | Ranking pembaca teratas, buku yang sudah dan sedang dibaca per orang, dan siapa yang sudah atau sedang membaca tiap buku. |
| **Katalog** | Judul, penulis, jumlah halaman, kategori, sinopsis. Awalnya terisi 37 buku dari katalog Rak Buku ZANEVA. |

## Teknologi

Next.js 16 (App Router) · Prisma 7 + PostgreSQL · iron-session (cookie terenkripsi) · bcrypt · Docker (build untuk EasyPanel).

## Variabel environment

| Variabel | Wajib | Keterangan |
|---|---|---|
| `DATABASE_URL` | ✅ | Connection string Postgres, mis. `postgresql://user:pass@bertumbuh-db:5432/bertumbuh` |
| `SESSION_SECRET` | ✅ | Acak minimal 32 karakter (`openssl rand -hex 32`). Kalau diganti, semua orang otomatis logout. |
| `APP_URL` | ✅ | URL publik app, mis. `https://bertumbuh.domainmu.com` (tanpa `/` di akhir). Dipakai untuk link di pesan WA dan menandai cookie `Secure` kalau `https`. |
| `WAHA_URL` | ✅ | Alamat WAHA-mu, mis. `https://waha.domainmu.com` |
| `WAHA_API_KEY` | ✅ | Dikirim sebagai header `X-Api-Key` |
| `WAHA_SESSION` | – | Nama sesi WAHA, default `default` |
| `DEFAULT_PASSWORD` | ✅ | Password sementara awal untuk 2 admin, dan default untuk daftar massal atau reset password (minimal 6 karakter) |
| `CRON_SECRET` | ✅ | Rahasia untuk memanggil `/api/cron/reminders` dari luar. Kalau kosong, endpoint itu menolak semua request. |
| `REMINDER_DELAY_MIN_MS` / `REMINDER_DELAY_MAX_MS` | – | Jeda acak antar pesan WA, default 3000 sampai 9000 ms |
| `DISABLE_SCHEDULER` | – | Isi `1` untuk mematikan scheduler internal (kalau hanya mau pakai cron eksternal) |

Contoh lengkap ada di `.env.example`.

## Deploy ke EasyPanel

### 1. Buat service Postgres
1. Di project EasyPanel kamu, klik **+ Service → Postgres**.
2. Beri nama, mis. `bertumbuh-db`, isi user, password, dan database (mis. `bertumbuh`). Klik **Create**.
3. Buka service itu, salin **Internal Connection URL** (bentuknya `postgres://user:pass@<project>_bertumbuh-db:5432/bertumbuh`). Itulah `DATABASE_URL`.

### 2. Buat service App dari repo private GitHub
1. **+ Service → App**, nama mis. `bertumbuh-bareng-zaneva`.
2. Tab **Source → GitHub**: pilih repo `rizkyzaneva-sukses/bertumbuh-bareng-zaneva`, branch `main`. (Untuk repo private, hubungkan GitHub ke EasyPanel dulu lewat Settings → GitHub, atau pakai deploy key / personal access token.)
3. Tab **Build**: pilih **Dockerfile** (path `Dockerfile`, context root repo).
4. Tab **Environment**: isi semua variabel di atas (`DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, `WAHA_URL`, `WAHA_API_KEY`, `WAHA_SESSION`, `DEFAULT_PASSWORD`, `CRON_SECRET`).
5. Tab **Domains & Proxy**: tambahkan domain, port tujuan **3000**, aktifkan HTTPS. Pastikan `APP_URL` sama dengan domain ini.
6. Klik **Deploy**.

### 3. Migrasi dan seed
Tidak perlu manual. Setiap container start menjalankan:

```
npx prisma migrate deploy   # membuat/mengupdate tabel
npx tsx prisma/seed.ts      # admin awal + katalog 37 buku (idempoten)
node server.js
```

Seed membuat 2 admin (kalau belum ada) dan mengisi katalog **sekali saja**. Buku yang kamu hapus tidak akan muncul lagi saat redeploy, dan password admin yang sudah diganti tidak ditimpa. Kalau mau menjalankan manual lewat **Console** EasyPanel:

```
npx prisma migrate deploy
npx tsx prisma/seed.ts
npm run seed:books      # menambahkan buku katalog yang judulnya belum ada
```

### 4. Login pertama
- Admin: **081220210193** dan **085177555437**.
- Password awal = nilai `DEFAULT_PASSWORD`. Saat login pertama, popup memaksa ganti password.
- Setelah itu buka **Admin → Pengguna** untuk mendaftarkan anggota tim (tempel daftar `Nama, nomor HP` atau unggah CSV).

### 5. Siapkan WAHA
- Sesi WAHA harus berstatus **WORKING** (QR sudah di-scan).
- App memanggil `POST {WAHA_URL}/api/sendText` dengan header `X-Api-Key` dan body `{"session": "...", "chatId": "62xxxxxxxxxx@c.us", "text": "..."}`.
- Cek hasil kirim di **Admin → Pengingat WA** (status Terkirim atau Gagal).

## Cara kerja pengingat

- Scheduler berjalan **di dalam server app** (cek tiap 5 menit, zona waktu **Asia/Jakarta**). Pesan hanya dikirim antara **08.00 dan 20.00 WIB**; kalau server baru hidup lewat jam 08.00 pesan tetap terkirim hari itu, tapi tidak lewat jam 20.00.
- Tiap pinjaman paling banyak **1 pesan per hari**, dicatat di tabel `ReminderLog` (unik per pinjaman dan tanggal), jadi tidak ada pesan dobel walau job jalan berkali-kali atau ada dua instance. Pengiriman yang gagal dicoba ulang maksimal 3 kali per hari.
- Pesan pertama (hari jatuh tempo) berisi link `APP_URL/kembali/<token>`. Token ditandatangani (HMAC) dan sekali pakai: setelah buku dikembalikan atau link baru diterbitkan, link lama tidak berlaku. Pesan berikutnya tanpa link apa pun.
- **Hari Ahad dilewati.** Jatuh tempo tidak pernah jatuh di hari Ahad, dan pengingat lanjutan yang kena Ahad tidak dikirim (dilanjutkan Senin).
- Ada jeda acak 3 sampai 9 detik antar pesan.
- Opsional, pemicu manual atau cron eksternal: `POST /api/cron/reminders` dengan header `Authorization: Bearer <CRON_SECRET>`. Tetap mengikuti jendela jam dan anti-dobel. Tambahkan `?ignoreWindow=1` untuk mengabaikan jendela jam (uji manual).

## Catatan aturan

- Link “Balikin sekarang” langsung mencatat buku **dikembalikan** (tanpa konfirmasi admin). Admin tetap bisa menandai dikembalikan manual.
- Menghapus buku (hanya bisa kalau tidak sedang dipinjam) ikut menghapus riwayat baca buku itu.
- Jumlah halaman buku katalog sengaja **dikosongkan** karena belum ada sumber yang pasti; admin mengisinya lewat **Admin → Buku → Edit**. Sinopsis diambil dari kolom “Alasan Dipilih” dan “Relevansi Fungsi” di katalog Excel.
- Password sementara disimpan apa adanya supaya admin bisa membagikannya, dan otomatis dihapus begitu pengguna mengganti passwordnya.
- Nama admin kedua di seed adalah “Admin Kedua”; ubah lewat Admin → Pengguna → Ubah nama.

## Pengembangan lokal

```bash
npm install
cp .env.example .env              # isi nilainya
npm run localpg                   # (opsional) Postgres lokal tanpa Docker di port 54329
npx prisma migrate deploy
npm run db:seed
npm run dev
```

### Tes

```bash
npm test         # unit (tanggal, nomor HP, CSV, token) + integrasi (pinjam, pengingat dengan WAHA palsu, dashboard) + alur HTTP end-to-end
npm run build && npm run test:ui   # uji UI dengan Playwright + screenshot ke screens/
```

Tes memakai database `bbz_test` di Postgres lokal (`TEST_DATABASE_URL` untuk mengganti). `npm run build` harus dijalankan dulu karena tes end-to-end memakai server produksi.
