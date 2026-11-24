-- Usulan buku + langganan Web Push
-- Ditulis IDEMPOTENT: aman dijalankan berulang, juga di DB produksi yang
-- tabelnya belum ada. Tidak ada DROP, tidak menyentuh data lama.

DO $$ BEGIN
  CREATE TYPE "RequestStatus" AS ENUM ('BARU', 'DIPERTIMBANGKAN', 'DIBELI', 'DITOLAK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BookRequest" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT,
  "phone"     TEXT NOT NULL,
  "name"      TEXT NOT NULL DEFAULT '',
  "title"     TEXT NOT NULL,
  "url"       TEXT NOT NULL DEFAULT '',
  "note"      TEXT NOT NULL DEFAULT '',
  "source"    TEXT NOT NULL DEFAULT 'WA',
  "status"    "RequestStatus" NOT NULL DEFAULT 'BARU',
  "rawText"   TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BookRequest_status_createdAt_idx" ON "BookRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "BookRequest_userId_idx" ON "BookRequest"("userId");

DO $$ BEGIN
  ALTER TABLE "BookRequest"
    ADD CONSTRAINT "BookRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "endpoint"  TEXT NOT NULL,
  "p256dh"    TEXT NOT NULL,
  "auth"      TEXT NOT NULL,
  "userAgent" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");

DO $$ BEGIN
  ALTER TABLE "PushSubscription"
    ADD CONSTRAINT "PushSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
