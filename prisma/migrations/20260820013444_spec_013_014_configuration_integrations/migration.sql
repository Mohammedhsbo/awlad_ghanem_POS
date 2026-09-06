-- SPEC-013 System Administration & Configuration
-- SPEC-014 Integration & API Management
--
-- Regenerated from prisma/schema.prisma. The previous hand-written
-- 20260819233638_spec_013_configuration_system / 20260820013444_spec_014_integration_api_management
-- pair could not be applied: their tables declared TEXT id/FK columns while
-- User.id and Branch.id are UUID, so every FK to them failed with SQLSTATE 42804.
-- They had also drifted from the schema (e.g. SystemConfiguration.configValue
-- typed JSONB instead of TEXT, plus a createdBy column the model never had).
--
-- This migration replaces both and also lands the letters, notifications,
-- outbox and idempotency tables that were present in schema.prisma but had
-- never been captured in a migration. Column and table drops are absent by
-- design; the only DROPs re-create foreign keys with their declared
-- referential actions.

-- CreateEnum
CREATE TYPE "public"."LetterStatus" AS ENUM ('issued', 'received', 'not_received');

-- CreateEnum
CREATE TYPE "public"."LetterType" AS ENUM ('receipt', 'delivery');

-- CreateEnum
CREATE TYPE "public"."NotificationChannel" AS ENUM ('in_app', 'email', 'sms', 'whatsapp', 'push');

-- CreateEnum
CREATE TYPE "public"."NotificationStatus" AS ENUM ('pending', 'sent', 'delivered', 'failed', 'read');

-- CreateEnum
CREATE TYPE "public"."NotificationPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('order_confirmed', 'order_completed', 'payment_received', 'payment_reminder', 'installment_due', 'installment_overdue', 'reservation_expiring', 'reservation_expired', 'letter_issued', 'letter_received', 'transfer_initiated', 'transfer_received', 'system_alert', 'custom');

-- CreateEnum
CREATE TYPE "public"."ConfigDataType" AS ENUM ('string', 'number', 'boolean', 'json', 'date');

-- CreateEnum
CREATE TYPE "public"."ConfigScope" AS ENUM ('system', 'company', 'branch', 'user');

-- CreateEnum
CREATE TYPE "public"."FeatureFlagScope" AS ENUM ('system', 'branch', 'user');

-- CreateEnum
CREATE TYPE "public"."NumberingResetPolicy" AS ENUM ('never', 'yearly', 'monthly');

-- CreateEnum
CREATE TYPE "public"."HolidayScope" AS ENUM ('system', 'branch');

-- CreateEnum
CREATE TYPE "public"."ProviderCategory" AS ENUM ('payment', 'email', 'sms', 'whatsapp', 'storage', 'analytics', 'other');

-- CreateEnum
CREATE TYPE "public"."HealthStatus" AS ENUM ('healthy', 'degraded', 'unhealthy', 'unknown');

-- CreateEnum
CREATE TYPE "public"."WebhookEventStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'dead_letter');

-- DropForeignKey
ALTER TABLE "public"."FinancingContract" DROP CONSTRAINT "FinancingContract_approvedBy_fkey";

-- DropForeignKey
ALTER TABLE "public"."FinancingContract" DROP CONSTRAINT "FinancingContract_branchId_fkey";

-- DropForeignKey
ALTER TABLE "public"."FinancingContract" DROP CONSTRAINT "FinancingContract_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "public"."FinancingContract" DROP CONSTRAINT "FinancingContract_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."FinancingContract" DROP CONSTRAINT "FinancingContract_orderId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Installment" DROP CONSTRAINT "Installment_contractId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Invoice" DROP CONSTRAINT "Invoice_branchId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Invoice" DROP CONSTRAINT "Invoice_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Invoice" DROP CONSTRAINT "Invoice_orderId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Invoice" DROP CONSTRAINT "Invoice_reservationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Invoice" DROP CONSTRAINT "Invoice_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."InvoiceItem" DROP CONSTRAINT "InvoiceItem_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "public"."InvoiceItem" DROP CONSTRAINT "InvoiceItem_motorcycleId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_branchId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PaymentAllocation" DROP CONSTRAINT "PaymentAllocation_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PaymentAllocation" DROP CONSTRAINT "PaymentAllocation_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Refund" DROP CONSTRAINT "Refund_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Refund" DROP CONSTRAINT "Refund_processedBy_fkey";

-- AlterTable
ALTER TABLE "public"."FinancingContract" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Installment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Invoice" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Payment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."PaymentAllocation" ADD COLUMN     "installmentId" UUID;

-- AlterTable
ALTER TABLE "public"."Refund" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "public"."Letter" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "letterNumber" VARCHAR(30) NOT NULL,
    "customerId" UUID NOT NULL,
    "motorcycleId" UUID NOT NULL,
    "orderId" UUID,
    "reservationId" UUID,
    "branchId" UUID NOT NULL,
    "type" "public"."LetterType" NOT NULL DEFAULT 'receipt',
    "status" "public"."LetterStatus" NOT NULL DEFAULT 'issued',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "expectedDeliveryDate" DATE,
    "documentStorageRef" VARCHAR(255),
    "userId" UUID NOT NULL,
    "confirmedBy" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Letter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LetterDocument" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "letterId" UUID NOT NULL,
    "documentType" VARCHAR(50) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "storageRef" VARCHAR(500) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LetterDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LetterHistory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "letterId" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "fromStatus" VARCHAR(20),
    "toStatus" VARCHAR(20),
    "actorId" UUID NOT NULL,
    "reason" VARCHAR(500),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LetterHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "branchId" UUID,
    "type" "public"."NotificationType" NOT NULL,
    "channel" "public"."NotificationChannel" NOT NULL,
    "priority" "public"."NotificationPriority" NOT NULL DEFAULT 'normal',
    "title" VARCHAR(200) NOT NULL,
    "titleAr" VARCHAR(200),
    "message" TEXT NOT NULL,
    "messageAr" TEXT,
    "data" JSONB,
    "status" "public"."NotificationStatus" NOT NULL DEFAULT 'pending',
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "channel" "public"."NotificationChannel" NOT NULL,
    "titleEn" VARCHAR(200) NOT NULL,
    "titleAr" VARCHAR(200) NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "variables" JSONB DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationPreference" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "channel" "public"."NotificationChannel" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationDelivery" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notificationId" UUID NOT NULL,
    "channel" "public"."NotificationChannel" NOT NULL,
    "recipient" VARCHAR(255) NOT NULL,
    "status" "public"."NotificationStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "externalId" VARCHAR(255),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommunicationLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID,
    "customerId" UUID,
    "channel" "public"."NotificationChannel" NOT NULL,
    "direction" VARCHAR(20) NOT NULL,
    "subject" VARCHAR(200),
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "aggregateId" UUID NOT NULL,
    "aggregateType" VARCHAR(100) NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemConfiguration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "configKey" VARCHAR(100) NOT NULL,
    "configValue" TEXT NOT NULL,
    "dataType" "public"."ConfigDataType" NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" TEXT,
    "validationRules" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompanyConfiguration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "configKey" VARCHAR(100) NOT NULL,
    "configValue" TEXT NOT NULL,
    "dataType" "public"."ConfigDataType" NOT NULL,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "replacesConfigId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BranchConfiguration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branchId" UUID NOT NULL,
    "configKey" VARCHAR(100) NOT NULL,
    "configValue" TEXT NOT NULL,
    "dataType" "public"."ConfigDataType" NOT NULL,
    "inheritsFromCompany" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeatureFlag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flagKey" VARCHAR(100) NOT NULL,
    "flagName" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scope" "public"."FeatureFlagScope" NOT NULL,
    "targetBranches" JSONB,
    "rolloutPercentage" INTEGER NOT NULL DEFAULT 0,
    "environment" VARCHAR(20) NOT NULL DEFAULT 'production',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConfigurationAudit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "configType" VARCHAR(50) NOT NULL,
    "configKey" VARCHAR(100) NOT NULL,
    "branchId" UUID,
    "previousValue" TEXT,
    "newValue" TEXT NOT NULL,
    "changeReason" TEXT,
    "changedBy" UUID NOT NULL,
    "changeTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,

    CONSTRAINT "ConfigurationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentNumbering" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "documentType" VARCHAR(50) NOT NULL,
    "branchId" UUID,
    "prefix" VARCHAR(10),
    "includeBranchCode" BOOLEAN NOT NULL DEFAULT true,
    "includeYear" BOOLEAN NOT NULL DEFAULT true,
    "sequenceLength" INTEGER NOT NULL DEFAULT 4,
    "currentSequence" INTEGER NOT NULL DEFAULT 0,
    "resetPolicy" "public"."NumberingResetPolicy" NOT NULL DEFAULT 'yearly',
    "lastResetDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentNumbering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkingHours" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branchId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TIMESTAMP(3),
    "closeTime" TIMESTAMP(3),
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,

    CONSTRAINT "WorkingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Holiday" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "holidayName" VARCHAR(200) NOT NULL,
    "holidayDate" DATE NOT NULL,
    "scope" "public"."HolidayScope" NOT NULL,
    "branchId" UUID,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrencePattern" VARCHAR(50),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalProvider" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "providerKey" VARCHAR(100) NOT NULL,
    "providerName" VARCHAR(200) NOT NULL,
    "category" "public"."ProviderCategory" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "supportsWebhooks" BOOLEAN NOT NULL DEFAULT false,
    "healthEndpoint" TEXT,
    "documentationUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Integration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "providerId" UUID NOT NULL,
    "integrationName" VARCHAR(200) NOT NULL,
    "branchId" UUID,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "configuration" JSONB NOT NULL,
    "encryptedSecrets" TEXT,
    "environment" VARCHAR(20) NOT NULL DEFAULT 'production',
    "healthStatus" "public"."HealthStatus" NOT NULL DEFAULT 'unknown',
    "lastHealthCheck" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."APIKey" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "keyPrefix" VARCHAR(20) NOT NULL,
    "keyHash" VARCHAR(128) NOT NULL,
    "description" VARCHAR(500),
    "scope" JSONB NOT NULL,
    "branchId" UUID,
    "environment" VARCHAR(20) NOT NULL DEFAULT 'production',
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "APIKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WebhookEndpoint" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "integrationId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "secret" VARCHAR(128) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IntegrationWebhookEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "endpointId" UUID NOT NULL,
    "eventId" VARCHAR(200) NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "status" "public"."WebhookEventStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "responseStatus" INTEGER,
    "responseBody" TEXT,

    CONSTRAINT "IntegrationWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IntegrationLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "integrationId" UUID NOT NULL,
    "correlationId" VARCHAR(100) NOT NULL,
    "operation" VARCHAR(100) NOT NULL,
    "direction" VARCHAR(20) NOT NULL,
    "requestUrl" TEXT,
    "requestMethod" VARCHAR(20),
    "requestHeaders" JSONB,
    "requestBody" TEXT,
    "responseStatus" INTEGER,
    "responseHeaders" JSONB,
    "responseBody" TEXT,
    "duration" INTEGER,
    "errorCode" VARCHAR(100),
    "errorMessage" TEXT,
    "retryAttempt" INTEGER NOT NULL DEFAULT 0,
    "providerRequestId" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IntegrationAudit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "integrationId" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "changedBy" UUID NOT NULL,
    "changeReason" TEXT,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IdempotencyKey" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "idempotencyKey" VARCHAR(200) NOT NULL,
    "scope" VARCHAR(100) NOT NULL,
    "requestHash" VARCHAR(128) NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseHeaders" JSONB,
    "responseBody" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Letter_letterNumber_key" ON "public"."Letter"("letterNumber");

-- CreateIndex
CREATE INDEX "Letter_letterNumber_idx" ON "public"."Letter"("letterNumber");

-- CreateIndex
CREATE INDEX "Letter_customerId_idx" ON "public"."Letter"("customerId");

-- CreateIndex
CREATE INDEX "Letter_motorcycleId_idx" ON "public"."Letter"("motorcycleId");

-- CreateIndex
CREATE INDEX "Letter_orderId_idx" ON "public"."Letter"("orderId");

-- CreateIndex
CREATE INDEX "Letter_reservationId_idx" ON "public"."Letter"("reservationId");

-- CreateIndex
CREATE INDEX "Letter_branchId_idx" ON "public"."Letter"("branchId");

-- CreateIndex
CREATE INDEX "Letter_status_idx" ON "public"."Letter"("status");

-- CreateIndex
CREATE INDEX "Letter_type_idx" ON "public"."Letter"("type");

-- CreateIndex
CREATE INDEX "Letter_issuedAt_idx" ON "public"."Letter"("issuedAt");

-- CreateIndex
CREATE INDEX "Letter_userId_idx" ON "public"."Letter"("userId");

-- CreateIndex
CREATE INDEX "Letter_confirmedBy_idx" ON "public"."Letter"("confirmedBy");

-- CreateIndex
CREATE INDEX "Letter_status_branchId_idx" ON "public"."Letter"("status", "branchId");

-- CreateIndex
CREATE INDEX "Letter_status_issuedAt_idx" ON "public"."Letter"("status", "issuedAt");

-- CreateIndex
CREATE INDEX "LetterDocument_letterId_idx" ON "public"."LetterDocument"("letterId");

-- CreateIndex
CREATE INDEX "LetterDocument_documentType_idx" ON "public"."LetterDocument"("documentType");

-- CreateIndex
CREATE INDEX "LetterDocument_createdAt_idx" ON "public"."LetterDocument"("createdAt");

-- CreateIndex
CREATE INDEX "LetterDocument_letterId_version_idx" ON "public"."LetterDocument"("letterId", "version");

-- CreateIndex
CREATE INDEX "LetterHistory_letterId_idx" ON "public"."LetterHistory"("letterId");

-- CreateIndex
CREATE INDEX "LetterHistory_actorId_idx" ON "public"."LetterHistory"("actorId");

-- CreateIndex
CREATE INDEX "LetterHistory_action_idx" ON "public"."LetterHistory"("action");

-- CreateIndex
CREATE INDEX "LetterHistory_createdAt_idx" ON "public"."LetterHistory"("createdAt");

-- CreateIndex
CREATE INDEX "LetterHistory_letterId_createdAt_idx" ON "public"."LetterHistory"("letterId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_status_idx" ON "public"."Notification"("userId", "status");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "public"."Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_branchId_idx" ON "public"."Notification"("branchId");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "public"."Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "public"."Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_scheduledFor_idx" ON "public"."Notification"("scheduledFor");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "public"."Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_code_key" ON "public"."NotificationTemplate"("code");

-- CreateIndex
CREATE INDEX "NotificationTemplate_code_idx" ON "public"."NotificationTemplate"("code");

-- CreateIndex
CREATE INDEX "NotificationTemplate_type_idx" ON "public"."NotificationTemplate"("type");

-- CreateIndex
CREATE INDEX "NotificationTemplate_channel_idx" ON "public"."NotificationTemplate"("channel");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "public"."NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_type_channel_key" ON "public"."NotificationPreference"("userId", "type", "channel");

-- CreateIndex
CREATE INDEX "NotificationDelivery_notificationId_idx" ON "public"."NotificationDelivery"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_idx" ON "public"."NotificationDelivery"("status");

-- CreateIndex
CREATE INDEX "NotificationDelivery_channel_idx" ON "public"."NotificationDelivery"("channel");

-- CreateIndex
CREATE INDEX "NotificationDelivery_sentAt_idx" ON "public"."NotificationDelivery"("sentAt");

-- CreateIndex
CREATE INDEX "CommunicationLog_userId_idx" ON "public"."CommunicationLog"("userId");

-- CreateIndex
CREATE INDEX "CommunicationLog_customerId_idx" ON "public"."CommunicationLog"("customerId");

-- CreateIndex
CREATE INDEX "CommunicationLog_channel_idx" ON "public"."CommunicationLog"("channel");

-- CreateIndex
CREATE INDEX "CommunicationLog_sentAt_idx" ON "public"."CommunicationLog"("sentAt");

-- CreateIndex
CREATE INDEX "Outbox_processedAt_idx" ON "public"."Outbox"("processedAt");

-- CreateIndex
CREATE INDEX "Outbox_eventType_idx" ON "public"."Outbox"("eventType");

-- CreateIndex
CREATE INDEX "Outbox_aggregateType_aggregateId_idx" ON "public"."Outbox"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "Outbox_createdAt_idx" ON "public"."Outbox"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfiguration_configKey_key" ON "public"."SystemConfiguration"("configKey");

-- CreateIndex
CREATE INDEX "SystemConfiguration_category_idx" ON "public"."SystemConfiguration"("category");

-- CreateIndex
CREATE INDEX "SystemConfiguration_isActive_idx" ON "public"."SystemConfiguration"("isActive");

-- CreateIndex
CREATE INDEX "SystemConfiguration_configKey_isActive_idx" ON "public"."SystemConfiguration"("configKey", "isActive");

-- CreateIndex
CREATE INDEX "CompanyConfiguration_configKey_idx" ON "public"."CompanyConfiguration"("configKey");

-- CreateIndex
CREATE INDEX "CompanyConfiguration_isActive_idx" ON "public"."CompanyConfiguration"("isActive");

-- CreateIndex
CREATE INDEX "CompanyConfiguration_effectiveFrom_effectiveTo_idx" ON "public"."CompanyConfiguration"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "CompanyConfiguration_configKey_isActive_idx" ON "public"."CompanyConfiguration"("configKey", "isActive");

-- CreateIndex
CREATE INDEX "BranchConfiguration_branchId_idx" ON "public"."BranchConfiguration"("branchId");

-- CreateIndex
CREATE INDEX "BranchConfiguration_configKey_idx" ON "public"."BranchConfiguration"("configKey");

-- CreateIndex
CREATE INDEX "BranchConfiguration_isActive_idx" ON "public"."BranchConfiguration"("isActive");

-- CreateIndex
CREATE INDEX "BranchConfiguration_branchId_configKey_isActive_idx" ON "public"."BranchConfiguration"("branchId", "configKey", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BranchConfiguration_branchId_configKey_key" ON "public"."BranchConfiguration"("branchId", "configKey");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_flagKey_key" ON "public"."FeatureFlag"("flagKey");

-- CreateIndex
CREATE INDEX "FeatureFlag_flagKey_idx" ON "public"."FeatureFlag"("flagKey");

-- CreateIndex
CREATE INDEX "FeatureFlag_isEnabled_idx" ON "public"."FeatureFlag"("isEnabled");

-- CreateIndex
CREATE INDEX "FeatureFlag_scope_idx" ON "public"."FeatureFlag"("scope");

-- CreateIndex
CREATE INDEX "FeatureFlag_environment_idx" ON "public"."FeatureFlag"("environment");

-- CreateIndex
CREATE INDEX "ConfigurationAudit_configType_idx" ON "public"."ConfigurationAudit"("configType");

-- CreateIndex
CREATE INDEX "ConfigurationAudit_configKey_idx" ON "public"."ConfigurationAudit"("configKey");

-- CreateIndex
CREATE INDEX "ConfigurationAudit_branchId_idx" ON "public"."ConfigurationAudit"("branchId");

-- CreateIndex
CREATE INDEX "ConfigurationAudit_changedBy_idx" ON "public"."ConfigurationAudit"("changedBy");

-- CreateIndex
CREATE INDEX "ConfigurationAudit_changeTimestamp_idx" ON "public"."ConfigurationAudit"("changeTimestamp");

-- CreateIndex
CREATE INDEX "ConfigurationAudit_configKey_changeTimestamp_idx" ON "public"."ConfigurationAudit"("configKey", "changeTimestamp");

-- CreateIndex
CREATE INDEX "DocumentNumbering_documentType_idx" ON "public"."DocumentNumbering"("documentType");

-- CreateIndex
CREATE INDEX "DocumentNumbering_branchId_idx" ON "public"."DocumentNumbering"("branchId");

-- CreateIndex
CREATE INDEX "DocumentNumbering_isActive_idx" ON "public"."DocumentNumbering"("isActive");

-- CreateIndex
CREATE INDEX "DocumentNumbering_documentType_branchId_isActive_idx" ON "public"."DocumentNumbering"("documentType", "branchId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentNumbering_documentType_branchId_key" ON "public"."DocumentNumbering"("documentType", "branchId");

-- CreateIndex
CREATE INDEX "WorkingHours_branchId_idx" ON "public"."WorkingHours"("branchId");

-- CreateIndex
CREATE INDEX "WorkingHours_dayOfWeek_idx" ON "public"."WorkingHours"("dayOfWeek");

-- CreateIndex
CREATE INDEX "WorkingHours_isActive_idx" ON "public"."WorkingHours"("isActive");

-- CreateIndex
CREATE INDEX "WorkingHours_effectiveFrom_effectiveTo_idx" ON "public"."WorkingHours"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "WorkingHours_branchId_dayOfWeek_effectiveFrom_key" ON "public"."WorkingHours"("branchId", "dayOfWeek", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Holiday_holidayDate_idx" ON "public"."Holiday"("holidayDate");

-- CreateIndex
CREATE INDEX "Holiday_scope_idx" ON "public"."Holiday"("scope");

-- CreateIndex
CREATE INDEX "Holiday_branchId_idx" ON "public"."Holiday"("branchId");

-- CreateIndex
CREATE INDEX "Holiday_isActive_idx" ON "public"."Holiday"("isActive");

-- CreateIndex
CREATE INDEX "Holiday_scope_branchId_holidayDate_idx" ON "public"."Holiday"("scope", "branchId", "holidayDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalProvider_providerKey_key" ON "public"."ExternalProvider"("providerKey");

-- CreateIndex
CREATE INDEX "ExternalProvider_providerKey_idx" ON "public"."ExternalProvider"("providerKey");

-- CreateIndex
CREATE INDEX "ExternalProvider_category_idx" ON "public"."ExternalProvider"("category");

-- CreateIndex
CREATE INDEX "ExternalProvider_isEnabled_idx" ON "public"."ExternalProvider"("isEnabled");

-- CreateIndex
CREATE INDEX "Integration_providerId_idx" ON "public"."Integration"("providerId");

-- CreateIndex
CREATE INDEX "Integration_branchId_idx" ON "public"."Integration"("branchId");

-- CreateIndex
CREATE INDEX "Integration_isEnabled_idx" ON "public"."Integration"("isEnabled");

-- CreateIndex
CREATE INDEX "Integration_healthStatus_idx" ON "public"."Integration"("healthStatus");

-- CreateIndex
CREATE INDEX "Integration_environment_idx" ON "public"."Integration"("environment");

-- CreateIndex
CREATE UNIQUE INDEX "APIKey_keyPrefix_key" ON "public"."APIKey"("keyPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "APIKey_keyHash_key" ON "public"."APIKey"("keyHash");

-- CreateIndex
CREATE INDEX "APIKey_keyPrefix_idx" ON "public"."APIKey"("keyPrefix");

-- CreateIndex
CREATE INDEX "APIKey_keyHash_idx" ON "public"."APIKey"("keyHash");

-- CreateIndex
CREATE INDEX "APIKey_branchId_idx" ON "public"."APIKey"("branchId");

-- CreateIndex
CREATE INDEX "APIKey_isActive_idx" ON "public"."APIKey"("isActive");

-- CreateIndex
CREATE INDEX "APIKey_expiresAt_idx" ON "public"."APIKey"("expiresAt");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_integrationId_idx" ON "public"."WebhookEndpoint"("integrationId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_isEnabled_idx" ON "public"."WebhookEndpoint"("isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationWebhookEvent_eventId_key" ON "public"."IntegrationWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_endpointId_idx" ON "public"."IntegrationWebhookEvent"("endpointId");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_eventId_idx" ON "public"."IntegrationWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_eventType_idx" ON "public"."IntegrationWebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_status_idx" ON "public"."IntegrationWebhookEvent"("status");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_receivedAt_idx" ON "public"."IntegrationWebhookEvent"("receivedAt");

-- CreateIndex
CREATE INDEX "IntegrationWebhookEvent_processedAt_idx" ON "public"."IntegrationWebhookEvent"("processedAt");

-- CreateIndex
CREATE INDEX "IntegrationLog_integrationId_idx" ON "public"."IntegrationLog"("integrationId");

-- CreateIndex
CREATE INDEX "IntegrationLog_correlationId_idx" ON "public"."IntegrationLog"("correlationId");

-- CreateIndex
CREATE INDEX "IntegrationLog_operation_idx" ON "public"."IntegrationLog"("operation");

-- CreateIndex
CREATE INDEX "IntegrationLog_createdAt_idx" ON "public"."IntegrationLog"("createdAt");

-- CreateIndex
CREATE INDEX "IntegrationLog_responseStatus_idx" ON "public"."IntegrationLog"("responseStatus");

-- CreateIndex
CREATE INDEX "IntegrationAudit_integrationId_idx" ON "public"."IntegrationAudit"("integrationId");

-- CreateIndex
CREATE INDEX "IntegrationAudit_changedBy_idx" ON "public"."IntegrationAudit"("changedBy");

-- CreateIndex
CREATE INDEX "IntegrationAudit_createdAt_idx" ON "public"."IntegrationAudit"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_idempotencyKey_key" ON "public"."IdempotencyKey"("idempotencyKey");

-- CreateIndex
CREATE INDEX "IdempotencyKey_idempotencyKey_idx" ON "public"."IdempotencyKey"("idempotencyKey");

-- CreateIndex
CREATE INDEX "IdempotencyKey_scope_idx" ON "public"."IdempotencyKey"("scope");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "public"."IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE INDEX "PaymentAllocation_installmentId_idx" ON "public"."PaymentAllocation"("installmentId");

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "public"."Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceItem" ADD CONSTRAINT "InvoiceItem_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "public"."Motorcycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "public"."Installment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Refund" ADD CONSTRAINT "Refund_processedBy_fkey" FOREIGN KEY ("processedBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FinancingContract" ADD CONSTRAINT "FinancingContract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FinancingContract" ADD CONSTRAINT "FinancingContract_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FinancingContract" ADD CONSTRAINT "FinancingContract_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FinancingContract" ADD CONSTRAINT "FinancingContract_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FinancingContract" ADD CONSTRAINT "FinancingContract_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Installment" ADD CONSTRAINT "Installment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."FinancingContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Letter" ADD CONSTRAINT "Letter_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Letter" ADD CONSTRAINT "Letter_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "public"."Motorcycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Letter" ADD CONSTRAINT "Letter_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Letter" ADD CONSTRAINT "Letter_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "public"."Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Letter" ADD CONSTRAINT "Letter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Letter" ADD CONSTRAINT "Letter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Letter" ADD CONSTRAINT "Letter_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LetterDocument" ADD CONSTRAINT "LetterDocument_letterId_fkey" FOREIGN KEY ("letterId") REFERENCES "public"."Letter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LetterDocument" ADD CONSTRAINT "LetterDocument_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LetterHistory" ADD CONSTRAINT "LetterHistory_letterId_fkey" FOREIGN KEY ("letterId") REFERENCES "public"."Letter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LetterHistory" ADD CONSTRAINT "LetterHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "public"."Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationLog" ADD CONSTRAINT "CommunicationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationLog" ADD CONSTRAINT "CommunicationLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyConfiguration" ADD CONSTRAINT "CompanyConfiguration_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BranchConfiguration" ADD CONSTRAINT "BranchConfiguration_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BranchConfiguration" ADD CONSTRAINT "BranchConfiguration_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeatureFlag" ADD CONSTRAINT "FeatureFlag_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConfigurationAudit" ADD CONSTRAINT "ConfigurationAudit_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConfigurationAudit" ADD CONSTRAINT "ConfigurationAudit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentNumbering" ADD CONSTRAINT "DocumentNumbering_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkingHours" ADD CONSTRAINT "WorkingHours_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Holiday" ADD CONSTRAINT "Holiday_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Holiday" ADD CONSTRAINT "Holiday_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Integration" ADD CONSTRAINT "Integration_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "public"."ExternalProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Integration" ADD CONSTRAINT "Integration_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Integration" ADD CONSTRAINT "Integration_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."APIKey" ADD CONSTRAINT "APIKey_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."APIKey" ADD CONSTRAINT "APIKey_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "public"."Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationWebhookEvent" ADD CONSTRAINT "IntegrationWebhookEvent_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "public"."WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationLog" ADD CONSTRAINT "IntegrationLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "public"."Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationAudit" ADD CONSTRAINT "IntegrationAudit_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "public"."Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrationAudit" ADD CONSTRAINT "IntegrationAudit_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "public"."Installment_contractId_installmentNumber_unique" RENAME TO "Installment_contractId_installmentNumber_key";

-- RenameIndex
ALTER INDEX "public"."WebhookEvent_providerId_eventId_unique" RENAME TO "WebhookEvent_providerId_eventId_key";

