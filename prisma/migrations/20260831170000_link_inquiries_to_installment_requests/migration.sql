ALTER TABLE "public"."Inquiry" ADD COLUMN "financingCompanyId" UUID;
ALTER TABLE "public"."InstallmentRequest" ADD COLUMN "inquiryId" UUID;
ALTER TABLE "public"."InstallmentRequest"
  ADD COLUMN "buyerNationalIdBackImage" VARCHAR(500),
  ADD COLUMN "guarantorNationalIdBackImage" VARCHAR(500),
  ADD COLUMN "guarantorSignatureImage" VARCHAR(500);
ALTER TABLE "public"."InstallmentRequest"
  ALTER COLUMN "salarySlipImage" DROP NOT NULL,
  ALTER COLUMN "apartmentContractImage" DROP NOT NULL,
  ALTER COLUMN "guarantorName" DROP NOT NULL,
  ALTER COLUMN "guarantorPhone" DROP NOT NULL,
  ALTER COLUMN "guarantorNationalIdImage" DROP NOT NULL;
CREATE UNIQUE INDEX "InstallmentRequest_inquiryId_key" ON "public"."InstallmentRequest"("inquiryId");
CREATE INDEX "Inquiry_financingCompanyId_idx" ON "public"."Inquiry"("financingCompanyId");
ALTER TABLE "public"."Inquiry" ADD CONSTRAINT "Inquiry_financingCompanyId_fkey"
  FOREIGN KEY ("financingCompanyId") REFERENCES "public"."FinancingCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."InstallmentRequest" ADD CONSTRAINT "InstallmentRequest_inquiryId_fkey"
  FOREIGN KEY ("inquiryId") REFERENCES "public"."Inquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;