-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "googleId" VARCHAR(255),
                        ADD COLUMN "authProvider" VARCHAR(20) NOT NULL DEFAULT 'local';

-- CreateIndex
CREATE UNIQUE INDEX "Customer_googleId_key" ON "Customer"("googleId");

-- CreateIndex
CREATE INDEX "Customer_googleId_idx" ON "Customer"("googleId");