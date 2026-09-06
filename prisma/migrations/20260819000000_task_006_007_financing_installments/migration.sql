-- Task 006 & 007: Financing Contracts and Installments
-- Also adds missing Invoice, Payment, and related tables from schema

-- Enums (only create if not already existing)
DO $$ BEGIN
  CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'overpaid', 'cancelled', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'bank_transfer', 'cheque');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FinancingContractStatus" AS ENUM ('active', 'completed', 'defaulted', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "InstallmentStatus" AS ENUM ('upcoming', 'due', 'paid', 'overdue');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "InstallmentFrequency" AS ENUM ('monthly', 'quarterly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Invoice Table (skip if exists)
CREATE TABLE IF NOT EXISTS "Invoice" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoiceNumber" VARCHAR(50) UNIQUE NOT NULL,
  "customerId" UUID NOT NULL REFERENCES "Customer"("id") ON DELETE RESTRICT,
  "orderId" UUID UNIQUE REFERENCES "Order"("id") ON DELETE SET NULL,
  "reservationId" UUID UNIQUE REFERENCES "Reservation"("id") ON DELETE SET NULL,
  "branchId" UUID NOT NULL REFERENCES "Branch"("id") ON DELETE RESTRICT,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
  "totalAmount" DECIMAL(12, 2) NOT NULL,
  "paidAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "remainingAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "issueDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- InvoiceItem Table
CREATE TABLE IF NOT EXISTS "InvoiceItem" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoiceId" UUID NOT NULL REFERENCES "Invoice"("id") ON DELETE CASCADE,
  "motorcycleId" UUID NOT NULL REFERENCES "Motorcycle"("id") ON DELETE RESTRICT,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(12, 2) NOT NULL,
  "discount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "totalPrice" DECIMAL(12, 2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Payment Table
CREATE TABLE IF NOT EXISTS "Payment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "paymentReference" VARCHAR(50) UNIQUE NOT NULL,
  "invoiceId" UUID NOT NULL REFERENCES "Invoice"("id") ON DELETE RESTRICT,
  "customerId" UUID NOT NULL REFERENCES "Customer"("id") ON DELETE RESTRICT,
  "branchId" UUID NOT NULL REFERENCES "Branch"("id") ON DELETE RESTRICT,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "amount" DECIMAL(12, 2) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
  "reference" VARCHAR(200),
  "externalTransactionId" VARCHAR(200),
  "providerId" VARCHAR(100),
  "idempotencyKey" VARCHAR(200) UNIQUE NOT NULL,
  "cashAmountReceived" DECIMAL(12, 2),
  "cashChange" DECIMAL(12, 2),
  "confirmedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- PaymentAllocation Table
CREATE TABLE IF NOT EXISTS "PaymentAllocation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "paymentId" UUID NOT NULL REFERENCES "Payment"("id") ON DELETE CASCADE,
  "invoiceId" UUID NOT NULL REFERENCES "Invoice"("id") ON DELETE RESTRICT,
  "amount" DECIMAL(12, 2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentAllocation_paymentId_invoiceId_unique" UNIQUE ("paymentId", "invoiceId")
);

-- Refund Table
CREATE TABLE IF NOT EXISTS "Refund" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "refundReference" VARCHAR(50) UNIQUE NOT NULL,
  "paymentId" UUID NOT NULL REFERENCES "Payment"("id") ON DELETE RESTRICT,
  "amount" DECIMAL(12, 2) NOT NULL,
  "reason" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "processedBy" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "processedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- WebhookEvent Table
CREATE TABLE IF NOT EXISTS "WebhookEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "providerId" VARCHAR(50) NOT NULL,
  "eventId" VARCHAR(200) NOT NULL,
  "eventType" VARCHAR(100) NOT NULL,
  "providerTransactionId" VARCHAR(200) NOT NULL,
  "paymentId" UUID,
  "status" VARCHAR(50) NOT NULL,
  "result" VARCHAR(50) NOT NULL,
  "rawPayload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookEvent_providerId_eventId_unique" UNIQUE ("providerId", "eventId")
);

-- FinancingContract Table
CREATE TABLE IF NOT EXISTS "FinancingContract" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "contractNumber" VARCHAR(50) UNIQUE NOT NULL,
  "customerId" UUID NOT NULL REFERENCES "Customer"("id") ON DELETE RESTRICT,
  "orderId" UUID UNIQUE NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT,
  "branchId" UUID NOT NULL REFERENCES "Branch"("id") ON DELETE RESTRICT,
  "createdBy" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "approvedBy" UUID REFERENCES "User"("id") ON DELETE RESTRICT,
  "totalAmount" DECIMAL(12, 2) NOT NULL,
  "downPayment" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "financingAmount" DECIMAL(12, 2) NOT NULL,
  "numberOfInstallments" INTEGER NOT NULL,
  "installmentFrequency" "InstallmentFrequency" NOT NULL DEFAULT 'monthly',
  "interestRate" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  "startDate" DATE NOT NULL,
  "status" "FinancingContractStatus" NOT NULL DEFAULT 'active',
  "approvedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Installment Table
CREATE TABLE IF NOT EXISTS "Installment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "contractId" UUID NOT NULL REFERENCES "FinancingContract"("id") ON DELETE RESTRICT,
  "installmentNumber" INTEGER NOT NULL,
  "dueDate" DATE NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "paidAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "status" "InstallmentStatus" NOT NULL DEFAULT 'upcoming',
  "paidAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Installment_contractId_installmentNumber_unique" UNIQUE ("contractId", "installmentNumber")
);

-- Indexes for Invoice
CREATE INDEX IF NOT EXISTS "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");
CREATE INDEX IF NOT EXISTS "Invoice_customerId_idx" ON "Invoice"("customerId");
CREATE INDEX IF NOT EXISTS "Invoice_orderId_idx" ON "Invoice"("orderId");
CREATE INDEX IF NOT EXISTS "Invoice_reservationId_idx" ON "Invoice"("reservationId");
CREATE INDEX IF NOT EXISTS "Invoice_branchId_idx" ON "Invoice"("branchId");
CREATE INDEX IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX IF NOT EXISTS "Invoice_issueDate_idx" ON "Invoice"("issueDate");
CREATE INDEX IF NOT EXISTS "Invoice_createdAt_idx" ON "Invoice"("createdAt");
CREATE INDEX IF NOT EXISTS "Invoice_status_branchId_idx" ON "Invoice"("status", "branchId");

-- Indexes for InvoiceItem
CREATE INDEX IF NOT EXISTS "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");
CREATE INDEX IF NOT EXISTS "InvoiceItem_motorcycleId_idx" ON "InvoiceItem"("motorcycleId");

-- Indexes for Payment
CREATE INDEX IF NOT EXISTS "Payment_paymentReference_idx" ON "Payment"("paymentReference");
CREATE INDEX IF NOT EXISTS "Payment_invoiceId_idx" ON "Payment"("invoiceId");
CREATE INDEX IF NOT EXISTS "Payment_customerId_idx" ON "Payment"("customerId");
CREATE INDEX IF NOT EXISTS "Payment_branchId_idx" ON "Payment"("branchId");
CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment"("status");
CREATE INDEX IF NOT EXISTS "Payment_method_idx" ON "Payment"("method");
CREATE INDEX IF NOT EXISTS "Payment_idempotencyKey_idx" ON "Payment"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "Payment_externalTransactionId_idx" ON "Payment"("externalTransactionId");
CREATE INDEX IF NOT EXISTS "Payment_createdAt_idx" ON "Payment"("createdAt");
CREATE INDEX IF NOT EXISTS "Payment_status_branchId_idx" ON "Payment"("status", "branchId");

-- Indexes for PaymentAllocation
CREATE INDEX IF NOT EXISTS "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");
CREATE INDEX IF NOT EXISTS "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");

-- Indexes for Refund
CREATE INDEX IF NOT EXISTS "Refund_refundReference_idx" ON "Refund"("refundReference");
CREATE INDEX IF NOT EXISTS "Refund_paymentId_idx" ON "Refund"("paymentId");
CREATE INDEX IF NOT EXISTS "Refund_processedBy_idx" ON "Refund"("processedBy");
CREATE INDEX IF NOT EXISTS "Refund_createdAt_idx" ON "Refund"("createdAt");
CREATE INDEX IF NOT EXISTS "Refund_status_idx" ON "Refund"("status");

-- Indexes for WebhookEvent
CREATE INDEX IF NOT EXISTS "WebhookEvent_providerId_idx" ON "WebhookEvent"("providerId");
CREATE INDEX IF NOT EXISTS "WebhookEvent_eventId_idx" ON "WebhookEvent"("eventId");
CREATE INDEX IF NOT EXISTS "WebhookEvent_providerTransactionId_idx" ON "WebhookEvent"("providerTransactionId");
CREATE INDEX IF NOT EXISTS "WebhookEvent_paymentId_idx" ON "WebhookEvent"("paymentId");
CREATE INDEX IF NOT EXISTS "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");

-- Indexes for FinancingContract
CREATE INDEX IF NOT EXISTS "FinancingContract_contractNumber_idx" ON "FinancingContract"("contractNumber");
CREATE INDEX IF NOT EXISTS "FinancingContract_customerId_idx" ON "FinancingContract"("customerId");
CREATE INDEX IF NOT EXISTS "FinancingContract_orderId_idx" ON "FinancingContract"("orderId");
CREATE INDEX IF NOT EXISTS "FinancingContract_branchId_idx" ON "FinancingContract"("branchId");
CREATE INDEX IF NOT EXISTS "FinancingContract_status_idx" ON "FinancingContract"("status");
CREATE INDEX IF NOT EXISTS "FinancingContract_createdBy_idx" ON "FinancingContract"("createdBy");
CREATE INDEX IF NOT EXISTS "FinancingContract_approvedBy_idx" ON "FinancingContract"("approvedBy");
CREATE INDEX IF NOT EXISTS "FinancingContract_startDate_idx" ON "FinancingContract"("startDate");
CREATE INDEX IF NOT EXISTS "FinancingContract_status_branchId_idx" ON "FinancingContract"("status", "branchId");

-- Indexes for Installment
CREATE INDEX IF NOT EXISTS "Installment_contractId_idx" ON "Installment"("contractId");
CREATE INDEX IF NOT EXISTS "Installment_dueDate_idx" ON "Installment"("dueDate");
CREATE INDEX IF NOT EXISTS "Installment_status_idx" ON "Installment"("status");
CREATE INDEX IF NOT EXISTS "Installment_status_dueDate_idx" ON "Installment"("status", "dueDate");
