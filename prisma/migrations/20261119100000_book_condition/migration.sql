-- CreateEnum
CREATE TYPE "BookCondition" AS ENUM ('BAIK', 'RUSAK_RINGAN', 'RUSAK_BERAT', 'HILANG');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "condition" "BookCondition",
ADD COLUMN     "conditionNote" TEXT;
