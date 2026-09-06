-- CreateEnum
CREATE TYPE "public"."InquiryDocumentType" AS ENUM ('PENSION', 'COMMERCIAL_REGISTRY', 'NEITHER');

-- CreateEnum
CREATE TYPE "public"."SalePaymentMethod" AS ENUM ('CASH', 'VISA');

-- CreateEnum
CREATE TYPE "public"."SaleRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."PosReservationStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."PosInstallmentPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "public"."PosInstallmentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- CreateTable
CREATE TABLE "public"."Inquiry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerName" VARCHAR(200) NOT NULL,
    "customerPhone" VARCHAR(50) NOT NULL,
    "documentType" "public"."InquiryDocumentType" NOT NULL,
    "documentImage" TEXT,
    "idCardFrontImage" TEXT,
    "idCardBackImage" TEXT,
    "guarantorIdFrontImage" TEXT,
    "guarantorIdBackImage" TEXT,
    "guarantorSignatureImage" TEXT,
    "downPayment" DECIMAL(10,2),
    "motorcycleId" UUID,
    "createdBy" UUID,
    "branchId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Sale" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "motorcycleId" UUID NOT NULL,
    "customerName" VARCHAR(200) NOT NULL,
    "customerPhone" VARCHAR(50) NOT NULL,
    "customerIdImage" TEXT,
    "salePrice" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "public"."SalePaymentMethod" NOT NULL,
    "branchId" UUID,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SaleRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerName" VARCHAR(200) NOT NULL,
    "customerPhone" VARCHAR(50) NOT NULL,
    "motorcycleId" UUID NOT NULL,
    "financingCompanyId" UUID NOT NULL,
    "requestedAmount" DECIMAL(10,2) NOT NULL,
    "status" "public"."SaleRequestStatus" NOT NULL DEFAULT 'PENDING',
    "branchId" UUID,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PosReservation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerName" VARCHAR(200) NOT NULL,
    "customerPhone" VARCHAR(50) NOT NULL,
    "motorcycleId" UUID NOT NULL,
    "holdAmount" DECIMAL(10,2) NOT NULL,
    "reservationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "public"."PosReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "branchId" UUID,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PosInstallmentPlan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "saleRequestId" UUID,
    "customerName" VARCHAR(200) NOT NULL,
    "customerPhone" VARCHAR(50) NOT NULL,
    "motorcycleId" UUID NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remainingBalance" DECIMAL(12,2) NOT NULL,
    "status" "public"."PosInstallmentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "branchId" UUID,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosInstallmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PosInstallment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "planId" UUID NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "public"."PosInstallmentStatus" NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DesktopPermission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "pageKey" VARCHAR(80) NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesktopPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DesktopAttendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3),
    "branchId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesktopAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosInstallmentPlan_saleRequestId_key" ON "public"."PosInstallmentPlan"("saleRequestId");

-- CreateIndex
CREATE INDEX "DesktopPermission_userId_idx" ON "public"."DesktopPermission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DesktopPermission_userId_pageKey_key" ON "public"."DesktopPermission"("userId", "pageKey");

-- CreateIndex
CREATE INDEX "DesktopAttendance_userId_idx" ON "public"."DesktopAttendance"("userId");

-- CreateIndex
CREATE INDEX "DesktopAttendance_checkIn_idx" ON "public"."DesktopAttendance"("checkIn");

-- AddForeignKey
ALTER TABLE "public"."Inquiry" ADD CONSTRAINT "Inquiry_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "public"."Motorcycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Inquiry" ADD CONSTRAINT "Inquiry_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Inquiry" ADD CONSTRAINT "Inquiry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sale" ADD CONSTRAINT "Sale_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "public"."Motorcycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sale" ADD CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sale" ADD CONSTRAINT "Sale_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SaleRequest" ADD CONSTRAINT "SaleRequest_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "public"."Motorcycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SaleRequest" ADD CONSTRAINT "SaleRequest_financingCompanyId_fkey" FOREIGN KEY ("financingCompanyId") REFERENCES "public"."FinancingCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SaleRequest" ADD CONSTRAINT "SaleRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SaleRequest" ADD CONSTRAINT "SaleRequest_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PosReservation" ADD CONSTRAINT "PosReservation_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "public"."Motorcycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PosReservation" ADD CONSTRAINT "PosReservation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PosReservation" ADD CONSTRAINT "PosReservation_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PosInstallmentPlan" ADD CONSTRAINT "PosInstallmentPlan_saleRequestId_fkey" FOREIGN KEY ("saleRequestId") REFERENCES "public"."SaleRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PosInstallmentPlan" ADD CONSTRAINT "PosInstallmentPlan_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "public"."Motorcycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PosInstallmentPlan" ADD CONSTRAINT "PosInstallmentPlan_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PosInstallmentPlan" ADD CONSTRAINT "PosInstallmentPlan_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PosInstallment" ADD CONSTRAINT "PosInstallment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."PosInstallmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DesktopPermission" ADD CONSTRAINT "DesktopPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DesktopAttendance" ADD CONSTRAINT "DesktopAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DesktopAttendance" ADD CONSTRAINT "DesktopAttendance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
