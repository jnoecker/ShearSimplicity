-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'STYLIST', 'RECEPTIONIST', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('STAFF', 'ONLINE', 'PHONE', 'AI_AGENT', 'IMPORT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'STRIPE_TERMINAL', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'VOICE', 'EMAIL');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'CLIENT', 'WEBHOOK', 'AI_AGENT');

-- CreateEnum
CREATE TYPE "AggregateType" AS ENUM ('APPOINTMENT', 'CLIENT', 'PAYMENT', 'MESSAGE', 'STAFF_MEMBER', 'SERVICE', 'SALON');

-- CreateEnum
CREATE TYPE "PredictionConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "salons" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "clerkOrgId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "clerkUserId" TEXT,
    "email" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salon_memberships" (
    "id" UUID NOT NULL,
    "salonId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salon_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_members" (
    "id" UUID NOT NULL,
    "salonId" UUID NOT NULL,
    "userId" UUID,
    "displayName" TEXT NOT NULL,
    "title" TEXT,
    "color" TEXT,
    "bio" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "working_hours" (
    "id" UUID NOT NULL,
    "salonId" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinutesFromMidnight" INTEGER NOT NULL,
    "endMinutesFromMidnight" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "working_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "salonId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_categories" (
    "id" UUID NOT NULL,
    "salonId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "salonId" UUID NOT NULL,
    "categoryId" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "defaultDurationMinutes" INTEGER NOT NULL,
    "defaultPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "salonId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "source" "AppointmentSource" NOT NULL DEFAULT 'STAFF',
    "notes" TEXT,
    "internalNotes" TEXT,
    "createdById" UUID,
    "actualStartAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "actualDurationMinutes" INTEGER,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_services" (
    "id" UUID NOT NULL,
    "salonId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "serviceNameSnapshot" TEXT NOT NULL,
    "priceSnapshotCents" INTEGER NOT NULL,
    "durationSnapshotMinutes" INTEGER NOT NULL,
    "currencySnapshot" TEXT NOT NULL DEFAULT 'USD',
    "actualMinutes" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "salonId" UUID NOT NULL,
    "appointmentId" UUID,
    "clientId" UUID,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
    "providerPaymentId" TEXT,
    "providerCustomerId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "tipCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "receiptUrl" TEXT,
    "failureReason" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "salonId" UUID NOT NULL,
    "clientId" UUID,
    "channel" "MessageChannel" NOT NULL DEFAULT 'SMS',
    "direction" "MessageDirection" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "toAddress" TEXT NOT NULL,
    "fromAddress" TEXT,
    "body" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_events" (
    "id" UUID NOT NULL,
    "salonId" UUID,
    "aggregateType" "AggregateType" NOT NULL,
    "aggregateId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" UUID,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "salonId" UUID,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duration_predictions" (
    "id" UUID NOT NULL,
    "salonId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "predictedMinutes" INTEGER NOT NULL,
    "baselineMinutes" INTEGER NOT NULL,
    "confidence" "PredictionConfidence" NOT NULL,
    "factors" JSONB NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duration_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salons_slug_key" ON "salons"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "salons_clerkOrgId_key" ON "salons"("clerkOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "users_clerkUserId_key" ON "users"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "salon_memberships_salonId_role_idx" ON "salon_memberships"("salonId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "salon_memberships_salonId_userId_key" ON "salon_memberships"("salonId", "userId");

-- CreateIndex
CREATE INDEX "staff_members_salonId_isActive_idx" ON "staff_members"("salonId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_salonId_userId_key" ON "staff_members"("salonId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_id_salonId_key" ON "staff_members"("id", "salonId");

-- CreateIndex
CREATE INDEX "working_hours_salonId_staffMemberId_dayOfWeek_idx" ON "working_hours"("salonId", "staffMemberId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "clients_salonId_lastName_firstName_idx" ON "clients"("salonId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "clients_salonId_phone_key" ON "clients"("salonId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "clients_salonId_email_key" ON "clients"("salonId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "clients_id_salonId_key" ON "clients"("id", "salonId");

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_salonId_name_key" ON "service_categories"("salonId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_id_salonId_key" ON "service_categories"("id", "salonId");

-- CreateIndex
CREATE INDEX "services_salonId_isActive_idx" ON "services"("salonId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "services_salonId_slug_key" ON "services"("salonId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "services_id_salonId_key" ON "services"("id", "salonId");

-- CreateIndex
CREATE INDEX "appointments_salonId_startAt_idx" ON "appointments"("salonId", "startAt");

-- CreateIndex
CREATE INDEX "appointments_salonId_status_idx" ON "appointments"("salonId", "status");

-- CreateIndex
CREATE INDEX "appointments_salonId_staffMemberId_startAt_idx" ON "appointments"("salonId", "staffMemberId", "startAt");

-- CreateIndex
CREATE INDEX "appointments_salonId_clientId_startAt_idx" ON "appointments"("salonId", "clientId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_id_salonId_key" ON "appointments"("id", "salonId");

-- CreateIndex
CREATE INDEX "appointment_services_salonId_appointmentId_idx" ON "appointment_services"("salonId", "appointmentId");

-- CreateIndex
CREATE INDEX "appointment_services_salonId_serviceId_idx" ON "appointment_services"("salonId", "serviceId");

-- CreateIndex
CREATE INDEX "payments_salonId_status_createdAt_idx" ON "payments"("salonId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "payments_salonId_appointmentId_idx" ON "payments"("salonId", "appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_providerPaymentId_key" ON "payments"("provider", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_salonId_idempotencyKey_key" ON "payments"("salonId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "messages_salonId_clientId_createdAt_idx" ON "messages"("salonId", "clientId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_salonId_direction_createdAt_idx" ON "messages"("salonId", "direction", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "messages_channel_providerMessageId_key" ON "messages"("channel", "providerMessageId");

-- CreateIndex
CREATE INDEX "domain_events_salonId_occurredAt_idx" ON "domain_events"("salonId", "occurredAt");

-- CreateIndex
CREATE INDEX "domain_events_aggregateType_aggregateId_occurredAt_idx" ON "domain_events"("aggregateType", "aggregateId", "occurredAt");

-- CreateIndex
CREATE INDEX "domain_events_eventType_occurredAt_idx" ON "domain_events"("eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "domain_events_correlationId_idx" ON "domain_events"("correlationId");

-- CreateIndex
CREATE INDEX "outbox_events_status_nextAttemptAt_idx" ON "outbox_events"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "outbox_events_salonId_status_idx" ON "outbox_events"("salonId", "status");

-- CreateIndex
CREATE INDEX "duration_predictions_salonId_appointmentId_idx" ON "duration_predictions"("salonId", "appointmentId");

-- CreateIndex
CREATE INDEX "duration_predictions_modelVersion_createdAt_idx" ON "duration_predictions"("modelVersion", "createdAt");

-- AddForeignKey
ALTER TABLE "salon_memberships" ADD CONSTRAINT "salon_memberships_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_memberships" ADD CONSTRAINT "salon_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_staffMemberId_salonId_fkey" FOREIGN KEY ("staffMemberId", "salonId") REFERENCES "staff_members"("id", "salonId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_categoryId_salonId_fkey" FOREIGN KEY ("categoryId", "salonId") REFERENCES "service_categories"("id", "salonId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clientId_salonId_fkey" FOREIGN KEY ("clientId", "salonId") REFERENCES "clients"("id", "salonId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staffMemberId_salonId_fkey" FOREIGN KEY ("staffMemberId", "salonId") REFERENCES "staff_members"("id", "salonId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointmentId_salonId_fkey" FOREIGN KEY ("appointmentId", "salonId") REFERENCES "appointments"("id", "salonId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_serviceId_salonId_fkey" FOREIGN KEY ("serviceId", "salonId") REFERENCES "services"("id", "salonId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointmentId_salonId_fkey" FOREIGN KEY ("appointmentId", "salonId") REFERENCES "appointments"("id", "salonId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_clientId_salonId_fkey" FOREIGN KEY ("clientId", "salonId") REFERENCES "clients"("id", "salonId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_clientId_salonId_fkey" FOREIGN KEY ("clientId", "salonId") REFERENCES "clients"("id", "salonId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duration_predictions" ADD CONSTRAINT "duration_predictions_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "salons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duration_predictions" ADD CONSTRAINT "duration_predictions_appointmentId_salonId_fkey" FOREIGN KEY ("appointmentId", "salonId") REFERENCES "appointments"("id", "salonId") ON DELETE CASCADE ON UPDATE CASCADE;
