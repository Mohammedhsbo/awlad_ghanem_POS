CREATE TABLE "public"."DesktopOrder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderNumber" VARCHAR(30) NOT NULL,
    "customerId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'confirmed',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "idempotencyKey" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DesktopOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."DesktopOrderItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orderId" UUID NOT NULL,
    "motorcycleId" UUID NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT "DesktopOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."DesktopReservation" (
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
    "address" TEXT,
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "convertedOrderId" UUID,
    "idempotencyKey" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DesktopReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DesktopOrder_orderNumber_key" ON "public"."DesktopOrder"("orderNumber");
CREATE UNIQUE INDEX "DesktopOrder_idempotencyKey_key" ON "public"."DesktopOrder"("idempotencyKey");
CREATE UNIQUE INDEX "DesktopOrderItem_orderId_motorcycleId_key" ON "public"."DesktopOrderItem"("orderId", "motorcycleId");
CREATE UNIQUE INDEX "DesktopReservation_reservationNumber_key" ON "public"."DesktopReservation"("reservationNumber");
CREATE UNIQUE INDEX "DesktopReservation_convertedOrderId_key" ON "public"."DesktopReservation"("convertedOrderId");
CREATE UNIQUE INDEX "DesktopReservation_idempotencyKey_key" ON "public"."DesktopReservation"("idempotencyKey");
CREATE INDEX "DesktopOrder_customerId_idx" ON "public"."DesktopOrder"("customerId");
CREATE INDEX "DesktopOrder_branchId_idx" ON "public"."DesktopOrder"("branchId");
CREATE INDEX "DesktopOrder_userId_idx" ON "public"."DesktopOrder"("userId");
CREATE INDEX "DesktopOrder_status_idx" ON "public"."DesktopOrder"("status");
CREATE INDEX "DesktopOrder_createdAt_idx" ON "public"."DesktopOrder"("createdAt");
CREATE INDEX "DesktopOrderItem_orderId_idx" ON "public"."DesktopOrderItem"("orderId");
CREATE INDEX "DesktopOrderItem_motorcycleId_idx" ON "public"."DesktopOrderItem"("motorcycleId");
CREATE INDEX "DesktopReservation_customerId_idx" ON "public"."DesktopReservation"("customerId");
CREATE INDEX "DesktopReservation_motorcycleId_idx" ON "public"."DesktopReservation"("motorcycleId");
CREATE INDEX "DesktopReservation_branchId_idx" ON "public"."DesktopReservation"("branchId");
CREATE INDEX "DesktopReservation_userId_idx" ON "public"."DesktopReservation"("userId");
CREATE INDEX "DesktopReservation_status_expiresAt_idx" ON "public"."DesktopReservation"("status", "expiresAt");

ALTER TABLE "public"."DesktopOrder" ADD CONSTRAINT "DesktopOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."DesktopOrder" ADD CONSTRAINT "DesktopOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."DesktopOrder" ADD CONSTRAINT "DesktopOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."DesktopOrderItem" ADD CONSTRAINT "DesktopOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."DesktopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."DesktopOrderItem" ADD CONSTRAINT "DesktopOrderItem_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "public"."Motorcycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."DesktopReservation" ADD CONSTRAINT "DesktopReservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."DesktopReservation" ADD CONSTRAINT "DesktopReservation_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "public"."Motorcycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."DesktopReservation" ADD CONSTRAINT "DesktopReservation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."DesktopReservation" ADD CONSTRAINT "DesktopReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."DesktopReservation" ADD CONSTRAINT "DesktopReservation_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "public"."DesktopOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;