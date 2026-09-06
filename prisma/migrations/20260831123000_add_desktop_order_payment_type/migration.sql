CREATE TYPE "public"."DesktopOrderPaymentType" AS ENUM ('CASH', 'INSTALLMENT');

ALTER TABLE "public"."DesktopOrder"
ADD COLUMN "paymentType" "public"."DesktopOrderPaymentType";

UPDATE "public"."DesktopOrder"
SET "paymentType" = 'INSTALLMENT'
WHERE "paymentType" IS NULL;

ALTER TABLE "public"."DesktopOrder"
ALTER COLUMN "paymentType" SET NOT NULL;

CREATE INDEX "DesktopOrder_paymentType_idx" ON "public"."DesktopOrder"("paymentType");