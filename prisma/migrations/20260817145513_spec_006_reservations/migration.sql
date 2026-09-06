-- CreateEnum
CREATE TYPE "public"."ReservationStatus" AS ENUM ('active', 'converted', 'expired', 'cancelled');

-- CreateTable
CREATE TABLE "public"."Reservation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservationNumber" VARCHAR(30) NOT NULL,
    "customerId" UUID NOT NULL,
    "motorcycleId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "public"."ReservationStatus" NOT NULL DEFAULT 'active',
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remainingAmount" DECIMAL(12,2) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "convertedOrderId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_reservationNumber_key" ON "public"."Reservation"("reservationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_convertedOrderId_key" ON "public"."Reservation"("convertedOrderId");

-- CreateIndex
CREATE INDEX "Reservation_reservationNumber_idx" ON "public"."Reservation"("reservationNumber");

-- CreateIndex
CREATE INDEX "Reservation_customerId_idx" ON "public"."Reservation"("customerId");

-- CreateIndex
CREATE INDEX "Reservation_motorcycleId_idx" ON "public"."Reservation"("motorcycleId");

-- CreateIndex
CREATE INDEX "Reservation_status_idx" ON "public"."Reservation"("status");

-- CreateIndex
CREATE INDEX "Reservation_expiresAt_idx" ON "public"."Reservation"("expiresAt");

-- CreateIndex
CREATE INDEX "Reservation_branchId_idx" ON "public"."Reservation"("branchId");

-- CreateIndex
CREATE INDEX "Reservation_status_expiresAt_idx" ON "public"."Reservation"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "public"."Reservation" ADD CONSTRAINT "Reservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reservation" ADD CONSTRAINT "Reservation_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "public"."Motorcycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reservation" ADD CONSTRAINT "Reservation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reservation" ADD CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reservation" ADD CONSTRAINT "Reservation_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "public"."Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheckConstraints
ALTER TABLE "public"."Reservation" ADD CONSTRAINT "Reservation_status_check"
  CHECK (status IN ('active', 'converted', 'expired', 'cancelled'));

ALTER TABLE "public"."Reservation" ADD CONSTRAINT "Reservation_paidAmount_check"
  CHECK ("paidAmount" <= "totalPrice");

ALTER TABLE "public"."Reservation" ADD CONSTRAINT "Reservation_remainingAmount_check"
  CHECK ("remainingAmount" = "totalPrice" - "paidAmount");
