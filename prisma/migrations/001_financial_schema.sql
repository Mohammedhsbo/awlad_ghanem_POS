-- SPEC-008 Financial Schema Migration
-- TASK-001: Invoice, Payment, PaymentAllocation, Refund tables

-- Invoice Status Enum
CREATE TYPE "InvoiceStatus" AS ENUM (
  'draft',
  'issued',
  'partially_paid',
  'paid',
  'overpaid',
  'cancelled',
  'refunded'
);

-- Payment Status Enum
CREATE TYPE "PaymentStatus" AS ENUM (
  'pending',
  'completed',
  'failed',
  'cancelled',
  'refunded',
  'partially_refunded'
);

-- Payment Method Enum
CREATE TYPE "PaymentMethod" AS ENUM (
  'cash',
  'card',
  'bank_transfer',
  'cheque'
);

-- Invoice Table
CREATE TABLE "Invoice" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoiceNumber" VARCHAR(50) UNIQUE NOT NULL,
  "customerId" UUID NOT NULL REFERENCES "Customer"("id") ON DELETE RESTRICT,
  "orderId" UUID UNIQUE REFERENCES "Order"("id") ON DELETE SET NULL,
  "reservationId" UUID UNIQUE REFERENCES "Reservation"("id") ON DELETE SET NULL,
  "branchId" UUID NOT NULL REFERENCES "Branch"("id") ON DELETE RESTRICT,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
  "totalAmount" DECIMAL(12, 2) NOT NULL CHECK ("totalAmount" >= 0),
  "paidAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK ("paidAmount" >= 0),
  "remainingAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK ("remainingAmount" >= 0),
  "issueDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Invoice Item Table
CREATE TABLE "InvoiceItem" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoiceId" UUID NOT NULL REFERENCES "Invoice"("id") ON DELETE CASCADE,
  "motorcycleId" UUID NOT NULL REFERENCES "Motorcycle"("id") ON DELETE RESTRICT,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1 CHECK ("quantity" > 0),
  "unitPrice" DECIMAL(12, 2) NOT NULL CHECK ("unitPrice" >= 0),
  "discount" DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK ("discount" >= 0),
  "totalPrice" DECIMAL(12, 2) NOT NULL CHECK ("totalPrice" >= 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Payment Table
CREATE TABLE "Payment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "paymentReference" VARCHAR(50) UNIQUE NOT NULL,
  "invoiceId" UUID NOT NULL REFERENCES "Invoice"("id") ON DELETE RESTRICT,
  "customerId" UUID NOT NULL REFERENCES "Customer"("id") ON DELETE RESTRICT,
  "branchId" UUID NOT NULL REFERENCES "Branch"("id") ON DELETE RESTRICT,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "amount" DECIMAL(12, 2) NOT NULL CHECK ("amount" > 0),
  "method" "PaymentMethod" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
  "reference" VARCHAR(200),
  "externalTransactionId" VARCHAR(200),
  "providerId" VARCHAR(100),
  "idempotencyKey" VARCHAR(200) UNIQUE NOT NULL,
  "cashAmountReceived" DECIMAL(12, 2) CHECK ("cashAmountReceived" >= 0),
  "cashChange" DECIMAL(12, 2) CHECK ("cashChange" >= 0),
  "confirmedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Payment Allocation Table
CREATE TABLE "PaymentAllocation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "paymentId" UUID NOT NULL REFERENCES "Payment"("id") ON DELETE CASCADE,
  "invoiceId" UUID NOT NULL REFERENCES "Invoice"("id") ON DELETE RESTRICT,
  "amount" DECIMAL(12, 2) NOT NULL CHECK ("amount" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Refund Table
CREATE TABLE "Refund" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "refundReference" VARCHAR(50) UNIQUE NOT NULL,
  "paymentId" UUID NOT NULL REFERENCES "Payment"("id") ON DELETE RESTRICT,
  "amount" DECIMAL(12, 2) NOT NULL CHECK ("amount" > 0),
  "reason" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "processedBy" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "processedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Invoice
CREATE INDEX "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");
CREATE INDEX "Invoice_reservationId_idx" ON "Invoice"("reservationId");
CREATE INDEX "Invoice_branchId_idx" ON "Invoice"("branchId");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX "Invoice_issueDate_idx" ON "Invoice"("issueDate");
CREATE INDEX "Invoice_createdAt_idx" ON "Invoice"("createdAt");
CREATE INDEX "Invoice_status_branchId_idx" ON "Invoice"("status", "branchId");

-- Indexes for InvoiceItem
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");
CREATE INDEX "InvoiceItem_motorcycleId_idx" ON "InvoiceItem"("motorcycleId");

-- Indexes for Payment
CREATE INDEX "Payment_paymentReference_idx" ON "Payment"("paymentReference");
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");
CREATE INDEX "Payment_branchId_idx" ON "Payment"("branchId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE INDEX "Payment_method_idx" ON "Payment"("method");
CREATE INDEX "Payment_idempotencyKey_idx" ON "Payment"("idempotencyKey");
CREATE INDEX "Payment_externalTransactionId_idx" ON "Payment"("externalTransactionId");
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");
CREATE INDEX "Payment_status_branchId_idx" ON "Payment"("status", "branchId");

-- Indexes for PaymentAllocation
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_invoiceId_unique" ON "PaymentAllocation"("paymentId", "invoiceId");

-- Indexes for Refund
CREATE INDEX "Refund_refundReference_idx" ON "Refund"("refundReference");
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");
CREATE INDEX "Refund_processedBy_idx" ON "Refund"("processedBy");
CREATE INDEX "Refund_createdAt_idx" ON "Refund"("createdAt");
CREATE INDEX "Refund_status_idx" ON "Refund"("status");
