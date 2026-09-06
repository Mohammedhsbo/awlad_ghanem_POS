-- FinancingContract.orderId was globally unique, so an order whose contract
-- had been cancelled could never be financed again. The rule the service
-- actually enforces is narrower: at most one ACTIVE contract per order.

-- The index is backed by a unique constraint, so it has to go with the constraint.
ALTER TABLE "public"."FinancingContract" DROP CONSTRAINT "FinancingContract_orderId_key";


-- Enforce the real rule at the database level.
CREATE UNIQUE INDEX "FinancingContract_orderId_active_key"
  ON "public"."FinancingContract" ("orderId")
  WHERE "status" = 'active';
