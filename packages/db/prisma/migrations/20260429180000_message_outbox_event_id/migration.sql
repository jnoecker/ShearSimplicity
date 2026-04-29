-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "outboxEventId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "messages_outboxEventId_key" ON "messages"("outboxEventId");
