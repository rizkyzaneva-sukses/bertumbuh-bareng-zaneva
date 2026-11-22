-- Sampul buku: kolom URL di Book + tabel gambar unggahan.
ALTER TABLE "Book" ADD COLUMN "coverUrl" TEXT NOT NULL DEFAULT '';

CREATE TABLE "BookCover" (
    "bookId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BookCover_pkey" PRIMARY KEY ("bookId")
);

ALTER TABLE "BookCover" ADD CONSTRAINT "BookCover_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
