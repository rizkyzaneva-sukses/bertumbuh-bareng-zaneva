# -*- coding: utf-8 -*-
"""Bangun PDF panduan ringkas Bertumbuh Bareng Zaneva (untuk anggota, bukan admin)."""
import os
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, Image, KeepTogether,
                                NextPageTemplate, PageBreak, PageTemplate,
                                Paragraph, Spacer, Table, TableStyle)

SHOTS = r"D:\tmp\bbz\out\shots"
OUT = r"D:\tmp\bbz\out\Panduan-Bertumbuh-Bareng-Zaneva-v2.pdf"

INK   = colors.HexColor("#2b2118")
MUTED = colors.HexColor("#6b5f52")
ACC   = colors.HexColor("#c8553d")
CREAM = colors.HexColor("#fbf6ee")
BAND  = colors.HexColor("#33261c")
GREEN = colors.HexColor("#4a7c59")
AMBER = colors.HexColor("#b8802a")

PAGE_W, PAGE_H = A4
MARGIN = 17 * mm
COL_W = PAGE_W - 2 * MARGIN


def S(name, **kw):
    base = dict(fontName="Helvetica", fontSize=10, leading=14.2, textColor=INK)
    base.update(kw)
    return ParagraphStyle(name, **base)


st = {
    "h1":     S("h1", fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=ACC, spaceAfter=1),
    "sub":    S("sub", fontSize=10, leading=14.4, textColor=MUTED, spaceAfter=9, alignment=TA_JUSTIFY),
    "h2":     S("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=INK,
                spaceBefore=7, spaceAfter=4),
    "h3":     S("h3", fontName="Helvetica-Bold", fontSize=10.2, leading=13.5, textColor=ACC,
                spaceBefore=4, spaceAfter=2),
    "body":   S("body", alignment=TA_JUSTIFY, spaceAfter=5),
    "cap":    S("cap", fontSize=8.1, leading=10.8, textColor=MUTED, alignment=TA_CENTER, spaceBefore=3),
    "small":  S("small", fontSize=8.5, leading=11.8, textColor=MUTED),
    "bullet": S("bullet", spaceAfter=2.4, leftIndent=11, bulletIndent=1),
}


def P(t, s="body"):
    return Paragraph(t, st[s])


def bullets(items):
    return [Paragraph(t, st["bullet"], bulletText="\u2022") for t in items]


def callout(kind, title, body):
    bg, bar, border = {
        "info": (colors.HexColor("#f4ece0"), AMBER, colors.HexColor("#eeddc4")),
        "ok":   (colors.HexColor("#eaf2ec"), GREEN, colors.HexColor("#d4e5da")),
        "warn": (colors.HexColor("#fbeae6"), ACC,   colors.HexColor("#f1d0c8")),
    }[kind]
    barhex = "#" + bar.hexval().lstrip("0x")
    inner = [Paragraph('<font color="%s"><b>%s</b></font>' % (barhex, title),
                       S("ct", fontSize=9.4, leading=13))]
    for b in body:
        inner.append(Paragraph(b, S("cb", fontSize=9.1, leading=12.8, spaceBefore=2.5)))
    t = Table([[inner]], colWidths=[COL_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.6, border),
        ("LINEBEFORE", (0, 0), (0, -1), 3.2, bar),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def shot(name, width_mm, max_h_mm=None):
    path = os.path.join(SHOTS, name + ".png")
    from PIL import Image as PILImage
    w, h = PILImage.open(path).size
    ratio = h / w
    ww = width_mm * mm
    hh = ww * ratio
    if max_h_mm and hh > max_h_mm * mm:
        hh = max_h_mm * mm
        ww = hh / ratio
    return Image(path, width=ww, height=hh)


def hfig(title, name, caption, width_mm, max_h_mm=None):
    return KeepTogether([Paragraph(title, st["h3"]), shot(name, width_mm, max_h_mm),
                         Paragraph(caption, st["cap"])])


def step_table(rows, w1=10.5):
    data = [[Paragraph("<b>%s</b>" % n, S("n", fontSize=9.6, leading=12.6,
                                          textColor=colors.white, alignment=TA_CENTER)),
             Paragraph(t, S("t", fontSize=9.3, leading=12.6))] for n, t in rows]
    t = Table(data, colWidths=[w1 * mm, COL_W - w1 * mm], hAlign="LEFT")
    style = [("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("LEFTPADDING", (1, 0), (1, -1), 7),
             ("RIGHTPADDING", (1, 0), (1, -1), 2),
             ("TOPPADDING", (0, 0), (-1, -1), 3),
             ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]
    for i in range(len(data)):
        style.append(("BACKGROUND", (0, i), (0, i), ACC))
    t.setStyle(TableStyle(style))
    return t


def cover_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BAND)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setFillColor(colors.HexColor("#4a382a"))
    canvas.rect(0, PAGE_H * 0.30, PAGE_W, 3.2, stroke=0, fill=1)
    canvas.setFillColor(colors.HexColor("#241a13"))
    canvas.rect(0, 0, PAGE_W, PAGE_H * 0.13, stroke=0, fill=1)
    canvas.restoreState()


def body_bg(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setFillColor(ACC)
    canvas.rect(0, PAGE_H - 9 * mm, PAGE_W, 2.4, stroke=0, fill=1)
    canvas.setFont("Helvetica", 7.6)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, PAGE_H - 7.2 * mm, "BERTUMBUH BARENG ZANEVA  \u00b7  PANDUAN ANGGOTA")
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 7.2 * mm, "books.maulanacorp.biz.id")
    canvas.setStrokeColor(colors.HexColor("#e3d7c6"))
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, 12 * mm, PAGE_W - MARGIN, 12 * mm)
    canvas.setFont("Helvetica", 7.6)
    canvas.drawString(MARGIN, 8.6 * mm, "Simpan PDF ini \u2014 atau buka menu Panduan di dalam app.")
    canvas.drawRightString(PAGE_W - MARGIN, 8.6 * mm, "Halaman %d" % (doc.page - 1))
    canvas.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4,
                      leftMargin=MARGIN, rightMargin=MARGIN,
                      topMargin=15 * mm, bottomMargin=16 * mm,
                      title="Panduan Anggota - Bertumbuh Bareng Zaneva",
                      author="Zaneva")
doc.addPageTemplates([
    PageTemplate(id="cover", frames=[Frame(MARGIN, MARGIN, COL_W, PAGE_H - 2 * MARGIN, id="cf")],
                 onPage=cover_bg),
    PageTemplate(id="body", frames=[Frame(MARGIN, 16 * mm, COL_W, PAGE_H - 31 * mm, id="bf")],
                 onPage=body_bg),
])

story = []

# ============================================================ COVER
story += [
    Spacer(1, 40 * mm),
    Paragraph('<font color="#e8b4a4" size="9.5"><b>PANDUAN ANGGOTA</b></font>', S("k", leading=14)),
    Spacer(1, 5 * mm),
    Paragraph('<font color="#ffffff" size="30" face="Helvetica-Bold">Bertumbuh<br/>Bareng Zaneva</font>',
              S("cv", leading=36)),
    Spacer(1, 6 * mm),
    Paragraph('<font color="#d8c6b6" size="12.5">Cara pinjam buku kantor lewat HP \u2014<br/>'
              '5 menit langsung bisa.</font>', S("cvs", leading=18)),
    Spacer(1, 15 * mm),
]
cover_tbl = Table([
    [Paragraph('<font color="#a08d7c" size="8.6">ALAMAT</font>', S("c1", leading=11)),
     Paragraph('<font color="#ffffff" size="10.5"><b>books.maulanacorp.biz.id</b></font>', S("c2", leading=13))],
    [Paragraph('<font color="#a08d7c" size="8.6">LOGIN</font>', S("c3", leading=11)),
     Paragraph('<font color="#ffffff" size="10.5">Nomor HP + password dari admin</font>', S("c4", leading=13))],
    [Paragraph('<font color="#a08d7c" size="8.6">PINJAM</font>', S("c5", leading=11)),
     Paragraph('<font color="#ffffff" size="10.5">Maksimal 2 buku \u00b7 3 hari kerja</font>', S("c6", leading=13))],
], colWidths=[30 * mm, COL_W - 30 * mm])
cover_tbl.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ("LINEBELOW", (0, 0), (-1, -2), 0.5, colors.HexColor("#54402f")),
    ("LEFTPADDING", (0, 0), (0, -1), 0),
]))
story += [cover_tbl, Spacer(1, 14 * mm),
          Table([[shot("03-beranda", 33, 70), shot("04-rak", 33, 70), shot("09-riwayat", 33, 70)]],
                colWidths=[COL_W / 3] * 3, hAlign="LEFT",
                style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                  ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                                  ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                  ("RIGHTPADDING", (0, 0), (-1, -1), 0)])),
          Spacer(1, 3 * mm),
          Paragraph('<font color="#8d7a69" size="8">Tampilan di HP: Beranda \u00b7 Rak Buku \u00b7 Riwayat</font>',
                    S("cp", fontSize=8, leading=11)),
          Spacer(1, 12 * mm),
          Paragraph('<font color="#8d7a69" size="8.4">Untuk tim ZANEVA \u00b7 November 2026 \u00b7 Edisi 2</font>',
                    S("cf", leading=11)),
          NextPageTemplate("body"), PageBreak()]

# ============================================================ HAL 2 — Masuk
story += [
    P("Mulai dari sini", "h1"),
    P("Ini perpustakaan buku kantor. Bukunya fisik, ada di rak \u2014 daftar dan peminjamannya lewat "
      "web ini. Kamu bisa lihat buku apa yang tersedia, meminjam, mencatat sudah baca sampai halaman "
      "berapa, lalu mengembalikan.", "sub"),
    callout("ok", "Tiga aturan yang perlu diingat", [
        "Maksimal <b>2 buku</b> dipinjam bersamaan \u00b7 lama pinjam <b>3 hari kerja</b> "
        "(hari Ahad tidak dihitung).",
        "Sudah selesai? Kembalikan buku fisiknya ke rak, lalu ketuk <b>Balikin</b> di app.",
        "Lupa langkahnya? Semua ada di menu <b>Panduan</b> dalam app.",
    ]),
    P("1. Masuk pertama kali", "h2"),
]
story += [step_table([
    ("1", "Buka <b>books.maulanacorp.biz.id</b> di browser HP. Nomormu sudah didaftarkan admin, "
          "jadi tidak perlu daftar sendiri."),
    ("2", "Isi <b>Nomor HP</b>. Boleh <b>08xxx</b> atau <b>628xxx</b> \u2014 sistem merapikan sendiri."),
    ("3", "Isi <b>Password</b> dari admin, lalu ketuk <b>Masuk</b>."),
])]
story += [Spacer(1, 5 * mm)]
story += [KeepTogether([
    Table([[shot("01-login", 51, 96), shot("02-login-terisi", 51, 96)]],
          colWidths=[COL_W / 2] * 2, hAlign="CENTER",
          style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("ALIGN", (0, 0), (-1, -1), "CENTER")])),
    Paragraph("Gambar 1. Halaman masuk (kiri) dan contoh sudah terisi (kanan). "
              "Tombol <b>Masuk</b> ada tepat di bawah kolom password.", st["cap"]),
])]
story += [Spacer(1, 5 * mm),
          callout("warn", "Kalau muncul \u201cNomor HP atau password salah\u201d", [
              "Pastikan nomor itu yang didaftarkan admin. Jangan mencoba berulang kali \u2014 sistem "
              "mengunci 15 menit. Langsung chat admin supaya diperiksa.",
          ]),
          PageBreak()]

# ============================================================ HAL 3 — Pinjam
story += [
    P("2. Cari dan pinjam buku", "h1"),
    P("Semua judul ada di menu <b>Buku</b> (ikon buku di bar bawah layar).", "sub"),
]
story += [step_table([
    ("1", "Ketuk menu <b>Buku</b> di bagian bawah layar."),
    ("2", "Cari judul atau penulis di kolom pencarian, atau ketuk kategori di atasnya."),
    ("3", "Perhatikan stoknya: <b>Tersedia 1/1</b> berarti bisa dipinjam."),
    ("4", "Ketuk <b>Pinjam</b>, lalu <b>OK</b> pada pertanyaan konfirmasi."),
    ("5", "Buku langsung pindah ke <b>Pinjaman saya</b> di Beranda dengan tanggal jatuh tempo."),
])]
story += [Spacer(1, 5 * mm)]
story += [hfig("Bedanya buku yang bisa dipinjam dan yang sedang kamu pegang", "04d-dua-kartu",
               "Gambar 2. Kartu kiri sudah kamu pinjam \u2014 ada label <b>Dipinjam kamu</b> dan tombolnya "
               "mati. Kartu kanan masih tersedia dengan tombol <b>Pinjam</b> berwarna.", 118, 116)]
story += [Spacer(1, 4 * mm),
          callout("info", "Tiga sebab tombol Pinjam tidak bisa ditekan", [
              "Kamu sudah meminjam 2 buku \u2014 kembalikan salah satu dulu \u00b7 buku itu sedang "
              "dipegang orang lain (namanya tertulis di kartu) \u00b7 kamu sudah meminjam buku itu.",
          ]),
          PageBreak()]

# ============================================================ HAL 4 — Progres
story += [
    P("3. Catat sudah baca sampai halaman berapa", "h1"),
    P("Catatan ini tersimpan <i>per buku</i>. Buku sudah dikembalikan lalu dipinjam lagi nanti, "
      "progresmu tidak hilang \u2014 jadi tidak perlu mengulang dari halaman satu.", "sub"),
]
story += [step_table([
    ("1", "Buka <b>Beranda</b>. Buku yang sedang dipinjam ada di bagian <b>Pinjaman saya</b>."),
    ("2", "Isi angka di kolom <b>Terakhir halaman</b>."),
    ("3", "Ketuk <b>Simpan</b>. Bar progres dan persentase langsung muncul."),
    ("4", "Sudah tamat? Ketuk <b>Beres baca</b>."),
])]
story += [Spacer(1, 4 * mm)]
story += [KeepTogether([
    shot("03-beranda", 62, 128),
    Paragraph("Gambar 3. Beranda. Bagian atas menunjukkan sisa slot pinjam, lalu kartu "
              "<b>Lanjutkan bacaanmu</b> dan <b>Pinjaman saya</b>. Di contoh ini baru 42 dari 133 "
              "halaman \u2014 32%.", st["cap"]),
])]
story += [Spacer(1, 4 * mm),
          callout("ok", "Beres baca \u2260 Balikin", [
              "<b>Beres baca</b> = catatanmu sudah tamat, buku masih di tanganmu. "
              "<b>Balikin</b> = buku fisiknya kembali ke rak. Bacanya dua-duanya kalau sudah selesai.",
              "Membaca di kantor lalu bukunya sudah masuk rak? Progres tetap bisa diisi dari menu "
              "<b>Riwayat</b> \u2014 judulnya ada di bagian <i>Lanjutkan bacaan</i>.",
          ]),
          PageBreak()]

# ============================================================ HAL 4b — Usul buku
story += [
    P("4. Usulkan buku yang belum ada", "h1"),
    P("Kalau judul yang kamu cari tidak ada di rak, jangan diam saja \u2014 usulkan. Admin membaca "
      "semua usulan, dan kamu akan dikabari lewat WhatsApp begitu bukunya masuk. Bisa juga langsung "
      "dari WhatsApp tanpa membuka app.", "sub"),
    P("Lewat app: menu Profil &#8594; Usulkan buku", "h2"),
]
story += [step_table([
    ("1", "Buka <b>Profil</b>, lalu ketuk <b>Usulkan buku</b>."),
    ("2", "Tulis <b>judul bukunya</b>. Ini saja sudah cukup."),
    ("3", "Kalau ada, tempel <b>link toko</b> (Shopee/Tokopedia) supaya admin gampang cek harga "
          "dan edisinya. Tidak wajib."),
    ("4", "Ketuk <b>Kirim usulan</b>. Usulanmu langsung masuk daftar admin."),
])]
story += [Spacer(1, 5 * mm)]
story += [KeepTogether([
    shot("13-usulan", 58, 120),
    Paragraph("Gambar 5. Halaman Usulkan Buku. Cukup judulnya; link toko hanya membantu admin.", st["cap"]),
])]
story += [Spacer(1, 4 * mm),
          P("Lewat WhatsApp: kirim pesan ke nomor Zaneva Official", "h2")]
story += [callout("ok", "Cukup kirim pesan seperti ini", [
    "<b>#usul Atomic Habits</b>",
    "<b>#usul Atomic Habits https://shopee.co.id/...</b> &nbsp;(link opsional)",
    "Bot akan membalas bahwa usulanmu sudah dicatat. Saat bukunya dibeli, kamu dikabari "
    "otomatis lewat WhatsApp \u2014 tidak perlu tanya-tanya.",
])]
story += [Spacer(1, 4 * mm),
          callout("info", "Kenapa lewat WhatsApp juga bisa", [
              "Supaya tidak perlu membuka app hanya untuk satu usulan kecil. Dua-duanya masuk ke "
              "daftar yang sama, jadi pilih yang paling gampang buatmu.",
          ]),
          PageBreak()]

# ============================================================ HAL 4c — Notifikasi
story += [
    P("5. Nyalakan notifikasi buku baru", "h1"),
    P("App ini bisa mengabari kamu di HP saat ada <b>buku baru</b> masuk rak dan saat pinjamanmu "
      "<b>hampir jatuh tempo</b>. Gratis, tidak lewat WhatsApp, dan tidak menguras baterai.", "sub"),
]
story += [step_table([
    ("1", "Buka <b>Profil</b>, lalu ketuk <b>Notifikasi</b>."),
    ("2", "Ketuk tombol <b>Aktifkan notifikasi</b>."),
    ("3", "Saat browser bertanya, pilih <b>Izinkan</b> (<i>Allow</i>)."),
    ("4", "Coba dengan tombol <b>Tes di HP ini</b> \u2014 kalau notifikasi muncul, berhasil."),
])]
story += [Spacer(1, 5 * mm)]
story += [KeepTogether([
    Table([[shot("14-notifikasi", 58, 118)]], colWidths=[COL_W], hAlign="CENTER",
          style=TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 0)])),
    Paragraph("Gambar 6. Halaman Notifikasi. Tombol <b>Aktifkan notifikasi</b> ada di bagian atas.", st["cap"]),
])]
story += [Spacer(1, 4 * mm),
          callout("warn", "Kalau tombolnya tidak ada atau notifikasi tetap diam", [
              "<b>Izin diblokir?</b> Ketuk ikon <b>gembok</b> di sebelah alamat situs &#8594; "
              "<b>Notifikasi</b> &#8594; <b>Izinkan</b>, lalu muat ulang halaman.",
              "<b>HP Xiaomi, Oppo, Vivo, Huawei?</b> Penghemat baterai sering mematikan notifikasi. "
              "Set <b>Tanpa batas</b> (<i>No restrictions</i>) untuk Chrome.",
              "<b>iPhone?</b> Harus dipasang ke Layar Utama dulu (lihat bagian 7), dan iOS minimal 16.4.",
          ]),
          PageBreak()]

# ============================================================ HAL 5 — Perpanjang / balikin
story += [
    P("6. Perpanjang atau kembalikan", "h1"),
    P("Jatuh tempo <b>3 hari kerja</b>, hari Ahad dilewati. Pinjam hari Kamis berarti jatuh tempo "
      "hari Selasa.", "sub"),
    P("Masih mau lanjut baca? Ketuk <b>Perpanjang</b>", "h2"),
]
story += bullets([
    "Tidak perlu mengembalikan buku dulu \u2014 cukup ketuk <b>Perpanjang</b>.",
    "Jatuh tempo digeser dari tanggal lama, bukan dihitung dari hari ini.",
    "Maksimal <b>2 kali</b> perpanjangan untuk tiap buku.",
    "Kalau semua eksemplar sedang dipegang orang lain, perpanjangan ditolak \u2014 buku harus "
    "kembali ke rak dulu.",
])
story += [P("Sudah selesai? Ketuk <b>Balikin</b>", "h2")]
story += bullets([
    "Kembalikan buku fisiknya ke rak, lalu ketuk <b>Balikin</b> di app.",
    "Pilih kondisi buku: <b>Baik</b>, <b>Rusak ringan</b>, <b>Rusak berat</b>, atau <b>Hilang</b>.",
    "Isi kondisi apa adanya \u2014 supaya buku yang rusak bisa segera diganti, bukan supaya dihukum.",
])
story += [Spacer(1, 4 * mm)]
story += [hfig("Semua tombol ada di satu kartu", "06c-kartu-lengkap",
               "Gambar 4. Kartu pinjaman: kolom <b>Terakhir halaman</b> + <b>Simpan</b> + "
               "<b>Beres baca</b> di atas, <b>Perpanjang</b> dan <b>Balikin</b> di bawah.", 118, 104)]
story += [Spacer(1, 4 * mm),
          callout("warn", "Jangan lupa buku fisiknya", [
              "Menandai <b>Balikin</b> tanpa menaruh bukunya di rak membuat buku tercatat tersedia "
              "padahal masih di tanganmu. Orang lain kehilangan kesempatan membacanya.",
          ]),
          PageBreak()]

# ============================================================ HAL 6 — Pasang di HP
story += [
    P("7. Pasang di layar utama HP", "h1"),
    P("App ini dipasang seperti aplikasi biasa \u2014 tidak lewat Play Store atau App Store, cukup "
      "dari browser. Setelah dipasang ada ikonnya sendiri dan terbuka tanpa address bar.", "sub"),
    P("Android (Chrome)", "h2"),
]
story += [step_table([
    ("1", "Buka <b>books.maulanacorp.biz.id</b> di Chrome."),
    ("2", "Ketuk titik tiga di kanan atas."),
    ("3", "Pilih <b>Tambahkan ke layar Utama</b> (<i>Add to Home screen</i>)."),
    ("4", "Ketuk <b>Tambahkan</b> \u2014 ikon buku muncul di layar HP."),
])]
story += [P("iPhone / iPad (Safari)", "h2")]
story += [step_table([
    ("1", "<b>Wajib Safari</b> \u2014 Chrome di iPhone tidak bisa memasang."),
    ("2", "Buka <b>books.maulanacorp.biz.id</b>."),
    ("3", "Ketuk ikon <b>Bagikan</b> (kotak dengan panah ke atas) di bagian bawah."),
    ("4", "Geser ke bawah, pilih <b>Tambahkan ke Layar Utama</b>."),
    ("5", "Ketuk <b>Tambah</b> di kanan atas."),
])]
story += [Spacer(1, 5 * mm),
          callout("info", "Kalau ikonnya tidak muncul", [
              "Pastikan alamatnya dibuka dengan <b>https://</b> dan bukan mode incognito. "
              "Di iPhone fitur ini hanya tersedia di Safari.",
          ]),
          Spacer(1, 7 * mm),
          P("Menu lain yang sering dipakai", "h2")]
menu_rows = [
    ("Beranda", "Buku yang sedang kamu pinjam, sisa slot, dan tombol lanjut baca."),
    ("Buku", "Rak lengkap: cari judul, lihat stok, lihat siapa yang sedang meminjam."),
    ("Riwayat", "Semua pinjamanmu \u2014 sedang berjalan, belum tuntas dibaca, dan sudah selesai."),
    ("Dasbor", "Peringkat pembaca dan statistik buku."),
    ("Panduan", "Semua petunjuk di PDF ini, versi paling baru."),
    ("Profil", "Ubah nama, ganti password, dan pintasan Notifikasi & Usulkan buku."),
]
story += [Table([[Paragraph("<b>%s</b>" % k, S("m%d" % i, fontSize=9.4, leading=12.2)),
                  Paragraph(v, S("v%d" % i, fontSize=9.4, leading=12.6))]
                 for i, (k, v) in enumerate(menu_rows)],
                colWidths=[25 * mm, COL_W - 25 * mm], style=TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                    ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#e3d7c6")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#eee3d3")),
                    ("TOPPADDING", (0, 0), (-1, -1), 5.2),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5.2),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ]))]
story += [PageBreak()]

# ============================================================ HAL 7 — FAQ
story += [P("Pertanyaan yang sering muncul", "h1"),
          P("Kalau pertanyaanmu belum ada di sini, chat admin \u2014 jangan berhenti membaca karena "
            "buntu teknis.", "sub")]
faq = [
    ("Lupa password, bagaimana?",
     "Chat admin, password-mu bisa diatur ulang. Setelah masuk, ganti sendiri di menu Profil."),
    ("Bisa pinjam lebih dari 2 buku?",
     "Tidak. Batas 2 buku supaya bukunya berputar dan semua kebagian."),
    ("Buku yang saya mau sedang dipinjam orang lain?",
     "Nama peminjamnya tertulis di kartu buku. Tunggu sampai kembali ke rak, atau pilih judul lain dulu."),
    ("Hari Ahad jatuh tempo, apakah terlambat?",
     "Tidak. Ahad tidak dihitung hari kerja, jadi jatuh temponya bergeser ke Senin."),
    ("Baca di kantor, bukunya tidak dibawa pulang. Perlu dicatat?",
     "Boleh \u2014 catat lewat menu Riwayat. Yang penting buku fisiknya kembali ke rak setelah selesai."),
    ("Bisa lihat progres bacaan orang lain?",
     "Bisa, di Dashboard. Ini disengaja \u2014 bagian dari semangat bertumbuh bareng."),
    ("Ganti HP atau install ulang, progres hilang?",
     "Tidak. Semua tersimpan di server. Cukup masuk lagi pakai nomor HP dan password."),
]
rows = [[Paragraph("<b>%s</b>" % q, S("q%d" % i, fontSize=9.3, leading=12.2, textColor=ACC)),
         Paragraph(a, S("a%d" % i, fontSize=9.2, leading=12.4))]
        for i, (q, a) in enumerate(faq)]
ft = Table(rows, colWidths=[56 * mm, COL_W - 56 * mm], hAlign="LEFT")
ft.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LINEBELOW", (0, 0), (-1, -2), 0.4, colors.HexColor("#e3d7c6")),
    ("TOPPADDING", (0, 0), (-1, -1), 5.4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("LEFTPADDING", (0, 0), (0, -1), 0),
    ("RIGHTPADDING", (0, 0), (0, -1), 8),
]))
story += [ft, Spacer(1, 7 * mm),
          callout("ok", "Tiga kebiasaan yang bikin semua lancar", [
              "<b>1.</b> Balikin buku fisik <i>dan</i> tandai di app \u2014 dua-duanya.",
              "<b>2.</b> Catat halaman sebelum menutup app, biar besok tidak bingung mulai dari mana.",
              "<b>3.</b> Butuh bantuan? Chat admin. Jangan diam-diam berhenti membaca.",
          ]),
          Spacer(1, 8 * mm),
          Paragraph('<font color="#c8553d" size="10.5"><b>Satu halaman sehari juga jalan.</b></font><br/>'
                    '<font color="#6b5f52" size="8.8">Tidak perlu cepat. Yang penting tidak berhenti.</font>',
                    S("end", fontSize=8.8, leading=13, alignment=TA_CENTER)),
          Spacer(1, 9 * mm),
          Table([[Paragraph('<font color="#6b5f52" size="8.6">Butuh bantuan?</font>',
                            S("hb", fontSize=8.6, leading=11.4)),
                  Paragraph('<font color="#2b2118" size="9.2">Chat admin di kantor atau lewat WhatsApp. '
                            'Sebutkan nomor HP yang terdaftar supaya cepat diperiksa.</font>',
                            S("hc", fontSize=9.2, leading=12.6)),
                  Paragraph('<font color="#6b5f52" size="8.6">Buka app</font>',
                            S("hd", fontSize=8.6, leading=11.4)),
                  Paragraph('<font color="#2b2118" size="9.2"><b>books.maulanacorp.biz.id</b><br/>'
                            'Menu <b>Panduan</b> = versi terbaru dokumen ini.</font>',
                            S("he", fontSize=9.2, leading=12.6))]],
                 colWidths=[24 * mm, 60 * mm, 20 * mm, COL_W - 104 * mm],
                 style=TableStyle([
                     ("VALIGN", (0, 0), (-1, -1), "TOP"),
                     ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                     ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#e3d7c6")),
                     ("LINEBELOW", (0, 0), (-1, 0), 0.4, colors.HexColor("#e3d7c6")),
                     ("TOPPADDING", (0, 0), (-1, -1), 7),
                     ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                     ("LEFTPADDING", (0, 0), (-1, -1), 8),
                 ]))]

doc.build(story)
print("OK ->", OUT, os.path.getsize(OUT), "bytes")
