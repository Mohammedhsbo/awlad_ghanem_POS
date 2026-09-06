-- CreateEnum
CREATE TYPE "public"."InstallmentRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "public"."Motorcycle" ADD COLUMN     "reservationDepositAmount" DECIMAL(12,2),
ADD COLUMN     "reservationDepositPercentage" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "public"."Reservation" ADD COLUMN     "penaltyAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."FinancingCompany" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancingCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InstallmentDuration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "months" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentDuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Settings" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'default',
    "instagramUrl" VARCHAR(500),
    "contactPhone" VARCHAR(20),
    "defaultDepositAmount" DECIMAL(12,2),
    "defaultDepositPercentage" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InstallmentRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerId" UUID NOT NULL,
    "motorcycleId" UUID NOT NULL,
    "financingCompanyId" UUID NOT NULL,
    "installmentDurationId" UUID NOT NULL,
    "status" "public"."InstallmentRequestStatus" NOT NULL DEFAULT 'pending',
    "buyerName" VARCHAR(200) NOT NULL,
    "buyerPhone" VARCHAR(20) NOT NULL,
    "buyerEmail" VARCHAR(255),
    "buyerAddress" TEXT,
    "buyerOccupation" VARCHAR(200),
    "buyerNationalIdImage" VARCHAR(500) NOT NULL,
    "salarySlipImage" VARCHAR(500) NOT NULL,
    "apartmentContractImage" VARCHAR(500) NOT NULL,
    "guarantorName" VARCHAR(200) NOT NULL,
    "guarantorPhone" VARCHAR(20) NOT NULL,
    "guarantorAddress" TEXT,
    "guarantorNationalIdImage" VARCHAR(500) NOT NULL,
    "motorcyclePrice" DECIMAL(12,2) NOT NULL,
    "downPayment" DECIMAL(12,2) NOT NULL,
    "monthlyInstallment" DECIMAL(12,2) NOT NULL,
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancingCompany_isActive_sortOrder_idx" ON "public"."FinancingCompany"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "InstallmentDuration_isActive_sortOrder_idx" ON "public"."InstallmentDuration"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentDuration_months_key" ON "public"."InstallmentDuration"("months");

-- CreateIndex
CREATE INDEX "InstallmentRequest_customerId_idx" ON "public"."InstallmentRequest"("customerId");

-- CreateIndex
CREATE INDEX "InstallmentRequest_motorcycleId_idx" ON "public"."InstallmentRequest"("motorcycleId");

-- CreateIndex
CREATE INDEX "InstallmentRequest_financingCompanyId_idx" ON "public"."InstallmentRequest"("financingCompanyId");

-- CreateIndex
CREATE INDEX "InstallmentRequest_installmentDurationId_idx" ON "public"."InstallmentRequest"("installmentDurationId");

-- CreateIndex
CREATE INDEX "InstallmentRequest_status_idx" ON "public"."InstallmentRequest"("status");

-- CreateIndex
CREATE INDEX "InstallmentRequest_createdAt_idx" ON "public"."InstallmentRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."InstallmentRequest" ADD CONSTRAINT "InstallmentRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InstallmentRequest" ADD CONSTRAINT "InstallmentRequest_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "public"."Motorcycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InstallmentRequest" ADD CONSTRAINT "InstallmentRequest_financingCompanyId_fkey" FOREIGN KEY ("financingCompanyId") REFERENCES "public"."FinancingCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InstallmentRequest" ADD CONSTRAINT "InstallmentRequest_installmentDurationId_fkey" FOREIGN KEY ("installmentDurationId") REFERENCES "public"."InstallmentDuration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
