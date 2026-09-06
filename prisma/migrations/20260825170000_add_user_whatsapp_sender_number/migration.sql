-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN "whatsappSenderNumber" VARCHAR(20);

-- CreateIndex
CREATE UNIQUE INDEX "User_whatsappSenderNumber_key" ON "public"."User"("whatsappSenderNumber");
