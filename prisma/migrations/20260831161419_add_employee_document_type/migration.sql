-- AlterEnum
ALTER TYPE "public"."InquiryDocumentType" ADD VALUE 'EMPLOYEE';

-- AlterTable
ALTER TABLE "public"."FinancingCompany" ALTER COLUMN "whatsappNumber" DROP DEFAULT;
