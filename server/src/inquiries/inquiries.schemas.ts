import { z } from "zod";

export const inquiryCreateSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerPhone: z.string().trim().min(5).max(50),
  address: z.string().trim().max(500).optional(),
  occupation: z.string().trim().max(200).optional(),
  documentType: z.enum(["EMPLOYEE", "PENSION", "COMMERCIAL_REGISTRY", "NEITHER"]),
  downPayment: z.coerce.number().min(0).optional(),
  motorcycleId: z.string().uuid().optional(),
  financingCompanyId: z.string().uuid().optional(),
  installmentDurationId: z.string().uuid().optional(),
});
