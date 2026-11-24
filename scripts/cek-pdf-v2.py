# -*- coding: utf-8 -*-
import pdfplumber

PATH = "D:/tmp/bbz/out/Panduan-Bertumbuh-Bareng-Zaneva-v2.pdf"
BAD = ["\\u2014", "\\u2192", "\\u00b7", "u2014", "u2192"]

with pdfplumber.open(PATH) as pdf:
    print("HALAMAN:", len(pdf.pages))
    total_bad = 0
    for i, pg in enumerate(pdf.pages, 1):
        t = pg.extract_text() or ""
        hits = [b for b in BAD if b in t]
        if hits:
            total_bad += 1
            lines = [l for l in t.split("\n") if any(b in l for b in hits)]
            print("RUSAK p%d %s -> %s" % (i, hits, lines[:2]))
    print("halaman rusak:", total_bad)

    # Panah harus benar-benar karakter U+2192
    p6 = pdf.pages[5].extract_text() or ""
    arrow = "\u2192"
    print("panah U+2192 di p6:", arrow in p6)
    for l in p6.split("\n"):
        if "gembok" in l or "Izinkan" in l:
            print("  >", l)

    # Nomor halaman di footer harus berurutan
    print("--- footer ---")
    for i, pg in enumerate(pdf.pages, 1):
        t = pg.extract_text() or ""
        for l in t.split("\n"):
            if l.strip().startswith("Halaman"):
                print("  pdf p%d -> %s" % (i, l.strip()))
