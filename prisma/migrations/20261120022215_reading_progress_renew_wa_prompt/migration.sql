-- CreateEnum
CREATE TYPE "ReadingStatus" AS ENUM ('SEDANG_DIBACA', 'SELESAI');

-- CreateEnum
CREATE TYPE "PromptKind" AS ENUM ('AFTER_RETURN');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "renewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WaPrompt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "loanId" TEXT,
    "kind" "PromptKind" NOT NULL DEFAULT 'AFTER_RETURN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3),
    "answer" TEXT,
    "replyText" TEXT,

    CONSTRAINT "WaPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "lastPage" INTEGER NOT NULL DEFAULT 0,
    "totalPages" INTEGER,
    "status" "ReadingStatus" NOT NULL DEFAULT 'SEDANG_DIBACA',
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaPrompt_userId_answeredAt_idx" ON "WaPrompt"("userId", "answeredAt");

-- CreateIndex
CREATE INDEX "WaPrompt_sentAt_answeredAt_idx" ON "WaPrompt"("sentAt", "answeredAt");

-- CreateIndex
CREATE INDEX "ReadingProgress_userId_status_idx" ON "ReadingProgress"("userId", "status");

-- CreateIndex
CREATE INDEX "ReadingProgress_bookId_idx" ON "ReadingProgress"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingProgress_userId_bookId_key" ON "ReadingProgress"("userId", "bookId");

-- AddForeignKey
ALTER TABLE "WaPrompt" ADD CONSTRAINT "WaPrompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaPrompt" ADD CONSTRAINT "WaPrompt_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
