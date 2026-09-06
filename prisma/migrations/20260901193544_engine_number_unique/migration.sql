/*
  Warnings:

  - A unique constraint covering the columns `[engineNumber]` on the table `Motorcycle` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Motorcycle_engineNumber_key" ON "public"."Motorcycle"("engineNumber");
