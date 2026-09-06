-- DropIndex
DROP INDEX "public"."DesktopOrder_paymentType_idx";

-- DropIndex
DROP INDEX "public"."Inquiry_financingCompanyId_idx";

-- DropIndex
DROP INDEX "public"."Inquiry_installmentDurationId_idx";

-- AlterTable
ALTER TABLE "public"."Motorcycle" ADD COLUMN     "engineNumber" VARCHAR(100);
