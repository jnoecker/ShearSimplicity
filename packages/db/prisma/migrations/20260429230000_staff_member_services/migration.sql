-- CreateTable
CREATE TABLE "staff_member_services" (
    "id" UUID NOT NULL,
    "salonId" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_member_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_member_services_salonId_staffMemberId_idx" ON "staff_member_services"("salonId", "staffMemberId");

-- CreateIndex
CREATE INDEX "staff_member_services_salonId_serviceId_idx" ON "staff_member_services"("salonId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_member_services_staffMemberId_serviceId_key" ON "staff_member_services"("staffMemberId", "serviceId");

-- AddForeignKey
ALTER TABLE "staff_member_services" ADD CONSTRAINT "staff_member_services_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_member_services" ADD CONSTRAINT "staff_member_services_staffMemberId_salonId_fkey" FOREIGN KEY ("staffMemberId", "salonId") REFERENCES "staff_members"("id", "salonId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_member_services" ADD CONSTRAINT "staff_member_services_serviceId_salonId_fkey" FOREIGN KEY ("serviceId", "salonId") REFERENCES "services"("id", "salonId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing stylist gets every active service in their salon.
-- The booking flow in 20b will gate stylist tiles on this matrix; without
-- this default, all existing bookings would suddenly fail validation.
INSERT INTO "staff_member_services" ("id", "salonId", "staffMemberId", "serviceId")
SELECT gen_random_uuid(), s."salonId", s."id", svc."id"
FROM "staff_members" s
JOIN "services" svc ON svc."salonId" = s."salonId" AND svc."isActive" = true;
