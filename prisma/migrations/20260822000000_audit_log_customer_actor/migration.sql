-- Audit entries can be authored by a staff User or by an e-commerce Customer.
-- Those are separate tables with disjoint id spaces, so the actor column is
-- split in two and each row sets exactly one of them.

-- AlterTable
ALTER TABLE "public"."AuditLog" ADD COLUMN     "customerId" UUID,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "AuditLog_customerId_idx" ON "public"."AuditLog"("customerId");

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

