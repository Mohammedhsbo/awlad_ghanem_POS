import { z } from "zod";

export const generatePlanSchema = z.object({
  saleRequestId: z.string().uuid(),
  months: z.coerce.number().min(1).max(120),
  interestRate: z.coerce.number().min(0).max(100),
});
