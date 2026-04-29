-- CreateTable
CREATE TABLE "processed_webhook_events" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processed_webhook_events_source_processedAt_idx" ON "processed_webhook_events"("source", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "processed_webhook_events_source_externalEventId_key" ON "processed_webhook_events"("source", "externalEventId");
