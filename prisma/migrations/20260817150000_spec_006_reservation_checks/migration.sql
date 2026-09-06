-- AddCheckConstraints for Reservation table (SPEC-006 TASK-001)
-- Applied separately because the constraints were added to migration SQL after initial deploy

DO $$
BEGIN
  -- Status valid values constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Reservation_status_check'
  ) THEN
    ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_status_check"
      CHECK (status IN ('active', 'converted', 'expired', 'cancelled'));
  END IF;

  -- paidAmount cannot exceed totalPrice
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Reservation_paidAmount_check'
  ) THEN
    ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_paidAmount_check"
      CHECK ("paidAmount" <= "totalPrice");
  END IF;

  -- remainingAmount must equal totalPrice - paidAmount
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Reservation_remainingAmount_check'
  ) THEN
    ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_remainingAmount_check"
      CHECK ("remainingAmount" = "totalPrice" - "paidAmount");
  END IF;
END $$;
