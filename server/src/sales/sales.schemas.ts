import { z } from "zod";

export const saleCreateSchema = z.object({
  motorcycleId: z.string().uuid(),
  customerName: z.string().trim().min(1).max(200),
  customerPhone: z.string().trim().min(5).max(50),
  salePrice: z.coerce.number().min(0),
  paymentMethod: z.enum(["CASH", "VISA"]),
});
