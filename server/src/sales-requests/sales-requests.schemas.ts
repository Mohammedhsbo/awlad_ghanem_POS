import { z } from "zod";

export const saleRequestCreateSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerPhone: z.string().trim().min(5).max(50),
  motorcycleId: z.string().uuid(),
  financingCompanyId: z.string().uuid(),
  requestedAmount: z.coerce.number().min(0),
});
