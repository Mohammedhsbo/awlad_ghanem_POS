CREATE TABLE "public"."CustomerInquiry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerId" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "occupation" VARCHAR(200) NOT NULL,
    "occupationAddress" TEXT NOT NULL,
    "idCardFrontImage" VARCHAR(500) NOT NULL,
    "idCardBackImage" VARCHAR(500) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerInquiry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerInquiry_customerId_idx" ON "public"."CustomerInquiry"("customerId");
CREATE INDEX "CustomerInquiry_createdBy_idx" ON "public"."CustomerInquiry"("createdBy");
CREATE INDEX "CustomerInquiry_createdAt_idx" ON "public"."CustomerInquiry"("createdAt");
ALTER TABLE "public"."CustomerInquiry" ADD CONSTRAINT "CustomerInquiry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."CustomerInquiry" ADD CONSTRAINT "CustomerInquiry_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;