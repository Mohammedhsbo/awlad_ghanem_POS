-- Make Payment.invoiceId and PaymentAllocation.invoiceId nullable
-- Required for installment payments that don't have invoices

-- Drop FK constraint on Payment.invoiceId, alter to nullable, re-add as nullable FK
ALTER TABLE "Payment" ALTER COLUMN "invoiceId" DROP NOT NULL;

-- Drop FK constraint on PaymentAllocation.invoiceId, alter to nullable, re-add as nullable FK
ALTER TABLE "PaymentAllocation" ALTER COLUMN "invoiceId" DROP NOT NULL;

-- Drop the paymentId+invoiceId unique constraint on PaymentAllocation
-- (since invoiceId can now be NULL, the unique constraint needs rethinking)
ALTER TABLE "PaymentAllocation" DROP CONSTRAINT IF EXISTS "PaymentAllocation_paymentId_invoiceId_unique";
