-- CreateTable
CREATE TABLE "ReadingLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "pagesRead" INTEGER NOT NULL DEFAULT 0,
    "lastPage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadingLog_dayKey_idx" ON "ReadingLog"("dayKey");

-- CreateIndex
CREATE INDEX "ReadingLog_userId_dayKey_idx" ON "ReadingLog"("userId", "dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingLog_userId_bookId_dayKey_key" ON "ReadingLog"("userId", "bookId", "dayKey");

-- AddForeignKey
ALTER TABLE "ReadingLog" ADD CONSTRAINT "ReadingLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingLog" ADD CONSTRAINT "ReadingLog_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
