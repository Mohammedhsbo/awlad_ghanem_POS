-- CreateEnum
CREATE TYPE "public"."MotorcycleStatus" AS ENUM ('in_transit', 'available', 'reserved', 'sold', 'in_transfer', 'maintenance', 'returned');

-- CreateEnum
CREATE TYPE "public"."PurchaseStatus" AS ENUM ('draft', 'ordered', 'partially_received', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."TransferStatus" AS ENUM ('initiated', 'in_transit', 'received', 'cancelled');

-- CreateTable
CREATE TABLE "public"."Brand" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nameAr" VARCHAR(200) NOT NULL,
    "nameEn" VARCHAR(200) NOT NULL,
    "logo" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nameAr" VARCHAR(200) NOT NULL,
    "nameEn" VARCHAR(200) NOT NULL,
    "parentId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Motorcycle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vin" VARCHAR(50) NOT NULL,
    "model" VARCHAR(200) NOT NULL,
    "year" INTEGER NOT NULL,
    "color" VARCHAR(50),
    "engineSize" VARCHAR(20),
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL,
    "status" "public"."MotorcycleStatus" NOT NULL DEFAULT 'available',
    "images" JSONB DEFAULT '[]',
    "branchId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Motorcycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Supplier" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "contactPerson" VARCHAR(200),
    "phone" VARCHAR(20),
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Purchase" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchaseNumber" VARCHAR(50) NOT NULL,
    "supplierId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" "public"."PurchaseStatus" NOT NULL DEFAULT 'draft',
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PurchaseItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchaseId" UUID NOT NULL,
    "motorcycleId" UUID,
    "model" VARCHAR(200) NOT NULL,
    "vin" VARCHAR(50),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Transfer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transferNumber" VARCHAR(50) NOT NULL,
    "fromBranchId" UUID NOT NULL,
    "toBranchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "public"."TransferStatus" NOT NULL DEFAULT 'initiated',
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TransferItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transferId" UUID NOT NULL,
    "motorcycleId" UUID NOT NULL,

    CONSTRAINT "TransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_nameAr_key" ON "public"."Brand"("nameAr");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_nameEn_key" ON "public"."Brand"("nameEn");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "public"."Category"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_nameAr_parentId_key" ON "public"."Category"("nameAr", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_nameEn_parentId_key" ON "public"."Category"("nameEn", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Motorcycle_vin_key" ON "public"."Motorcycle"("vin");

-- CreateIndex
CREATE INDEX "Motorcycle_status_idx" ON "public"."Motorcycle"("status");

-- CreateIndex
CREATE INDEX "Motorcycle_branchId_idx" ON "public"."Motorcycle"("branchId");

-- CreateIndex
CREATE INDEX "Motorcycle_brandId_idx" ON "public"."Motorcycle"("brandId");

-- CreateIndex
CREATE INDEX "Motorcycle_categoryId_idx" ON "public"."Motorcycle"("categoryId");

-- CreateIndex
CREATE INDEX "Motorcycle_year_idx" ON "public"."Motorcycle"("year");

-- CreateIndex
CREATE INDEX "Motorcycle_price_idx" ON "public"."Motorcycle"("price");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "public"."Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_purchaseNumber_key" ON "public"."Purchase"("purchaseNumber");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_idx" ON "public"."Purchase"("supplierId");

-- CreateIndex
CREATE INDEX "Purchase_branchId_idx" ON "public"."Purchase"("branchId");

-- CreateIndex
CREATE INDEX "Purchase_userId_idx" ON "public"."Purchase"("userId");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "public"."Purchase"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseItem_motorcycleId_key" ON "public"."PurchaseItem"("motorcycleId");

-- CreateIndex
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "public"."PurchaseItem"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_transferNumber_key" ON "public"."Transfer"("transferNumber");

-- CreateIndex
CREATE INDEX "Transfer_fromBranchId_idx" ON "public"."Transfer"("fromBranchId");

-- CreateIndex
CREATE INDEX "Transfer_toBranchId_idx" ON "public"."Transfer"("toBranchId");

-- CreateIndex
CREATE INDEX "Transfer_userId_idx" ON "public"."Transfer"("userId");

-- CreateIndex
CREATE INDEX "Transfer_status_idx" ON "public"."Transfer"("status");

-- CreateIndex
CREATE INDEX "TransferItem_transferId_idx" ON "public"."TransferItem"("transferId");

-- CreateIndex
CREATE INDEX "TransferItem_motorcycleId_idx" ON "public"."TransferItem"("motorcycleId");

-- AddForeignKey
ALTER TABLE "public"."Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Motorcycle" ADD CONSTRAINT "Motorcycle_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Motorcycle" ADD CONSTRAINT "Motorcycle_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "public"."Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Motorcycle" ADD CONSTRAINT "Motorcycle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Purchase" ADD CONSTRAINT "Purchase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "public"."Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PurchaseItem" ADD CONSTRAINT "PurchaseItem_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "public"."Motorcycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transfer" ADD CONSTRAINT "Transfer_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transfer" ADD CONSTRAINT "Transfer_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transfer" ADD CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransferItem" ADD CONSTRAINT "TransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "public"."Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransferItem" ADD CONSTRAINT "TransferItem_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "public"."Motorcycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
