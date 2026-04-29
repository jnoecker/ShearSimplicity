-- CreateEnum
CREATE TYPE "AppointmentSeriesStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'COMPLETED');

-- AlterEnum
ALTER TYPE "AggregateType" ADD VALUE 'APPOINTMENT_SERIES';

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "seriesId" UUID,
ADD COLUMN     "seriesIndex" INTEGER;

-- CreateTable
CREATE TABLE "appointment_series" (
    "id" UUID NOT NULL,
    "salonId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "anchorStartAt" TIMESTAMP(3) NOT NULL,
    "anchorIndex" INTEGER NOT NULL DEFAULT 1,
    "durationMinutes" INTEGER NOT NULL,
    "everyNWeeks" INTEGER NOT NULL,
    "stopAfterVisits" INTEGER,
    "status" "AppointmentSeriesStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "internalNotes" TEXT,
    "createdById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_series_services" (
    "id" UUID NOT NULL,
    "salonId" UUID NOT NULL,
    "seriesId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_series_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_salonId_seriesId_seriesIndex_idx" ON "appointments"("salonId", "seriesId", "seriesIndex");

-- CreateIndex
CREATE INDEX "appointment_series_salonId_status_idx" ON "appointment_series"("salonId", "status");

-- CreateIndex
CREATE INDEX "appointment_series_salonId_clientId_idx" ON "appointment_series"("salonId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_series_id_salonId_key" ON "appointment_series"("id", "salonId");

-- CreateIndex
CREATE INDEX "appointment_series_services_salonId_seriesId_idx" ON "appointment_series_services"("salonId", "seriesId");

-- CreateIndex
CREATE INDEX "appointment_series_services_salonId_serviceId_idx" ON "appointment_series_services"("salonId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_series_services_seriesId_serviceId_key" ON "appointment_series_services"("seriesId", "serviceId");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_seriesId_salonId_fkey" FOREIGN KEY ("seriesId", "salonId") REFERENCES "appointment_series"("id", "salonId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_series" ADD CONSTRAINT "appointment_series_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_series" ADD CONSTRAINT "appointment_series_clientId_salonId_fkey" FOREIGN KEY ("clientId", "salonId") REFERENCES "clients"("id", "salonId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_series" ADD CONSTRAINT "appointment_series_staffMemberId_salonId_fkey" FOREIGN KEY ("staffMemberId", "salonId") REFERENCES "staff_members"("id", "salonId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_series" ADD CONSTRAINT "appointment_series_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_series_services" ADD CONSTRAINT "appointment_series_services_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_series_services" ADD CONSTRAINT "appointment_series_services_seriesId_salonId_fkey" FOREIGN KEY ("seriesId", "salonId") REFERENCES "appointment_series"("id", "salonId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_series_services" ADD CONSTRAINT "appointment_series_services_serviceId_salonId_fkey" FOREIGN KEY ("serviceId", "salonId") REFERENCES "services"("id", "salonId") ON DELETE RESTRICT ON UPDATE CASCADE;
