ALTER TABLE "public"."Inquiry" ADD COLUMN "installmentDurationId" UUID;
CREATE INDEX "Inquiry_installmentDurationId_idx" ON "public"."Inquiry"("installmentDurationId");
ALTER TABLE "public"."Inquiry" ADD CONSTRAINT "Inquiry_installmentDurationId_fkey"
  FOREIGN KEY ("installmentDurationId") REFERENCES "public"."InstallmentDuration"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;