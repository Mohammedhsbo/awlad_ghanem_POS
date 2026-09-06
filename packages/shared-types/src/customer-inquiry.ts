import { z } from "zod";

export const createCustomerInquirySchema = z.object({
  customerId: z.string().uuid(),
  address: z.string().trim().min(1),
  phone: z.string().trim().min(1).max(20),
  occupation: z.string().trim().min(1).max(200),
  occupationAddress: z.string().trim().min(1),
});

export type CreateCustomerInquiryDto = z.infer<typeof createCustomerInquirySchema>;

export interface CustomerInquiryResponse {
  id: string;
  customerId: string;
  customer: { id: string; name: string; phone: string };
  address: string;
  phone: string;
  occupation: string;
  occupationAddress: string;
  idCardFrontImage: string;
  idCardBackImage: string;
  createdBy: string;
  createdAt: string;
}