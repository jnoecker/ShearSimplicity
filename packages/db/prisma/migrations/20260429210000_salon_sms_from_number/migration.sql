-- AlterTable
ALTER TABLE "salons" ADD COLUMN     "smsFromNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "salons_smsFromNumber_key" ON "salons"("smsFromNumber");
