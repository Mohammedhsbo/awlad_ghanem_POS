-- CreateEnum
CREATE TYPE "public"."MotorcycleCondition" AS ENUM ('NEW', 'IMPORTED');

-- AlterTable
ALTER TABLE "public"."Motorcycle" ADD COLUMN     "condition" "public"."MotorcycleCondition" NOT NULL DEFAULT 'NEW';
