import { z } from "zod";

const uuid = z.string().uuid();
const money = z.coerce.number().finite().min(0);

const whatsappNumberSchema = z.string().trim().min(8).max(20).regex(/^\+?[0-9\s-]{8,20}$/);

export const financingCompanyCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  whatsappNumber: whatsappNumberSchema,
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const financingCompanyUpdateSchema = financingCompanyCreateSchema.partial();

export const installmentDurationCreateSchema = z.object({
  months: z.number().int().positive().max(120),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const installmentDurationUpdateSchema = installmentDurationCreateSchema.partial();

export const settingsUpdateSchema = z.object({
  instagramUrl: z.string().trim().url().max(500).nullable().optional(),
  contactPhone: z.string().trim().max(20).nullable().optional(),
  defaultDepositAmount: money.nullable().optional(),
  defaultDepositPercentage: z.number().finite().min(0).max(100).nullable().optional(),
});

export const installmentRequestCreateSchema = z.object({
  motorcycleId: uuid,
  financingCompanyId: uuid,
  installmentDurationId: uuid,
  buyerName: z.string().trim().min(1).max(200),
  buyerPhone: z.string().trim().min(5).max(20),
  buyerEmail: z.string().trim().email().max(255).optional(),
  buyerAddress: z.string().trim().max(5000).optional(),
  buyerOccupation: z.string().trim().max(200).optional(),
  buyerNationalIdImage: z.string().trim().min(1).max(500),
  salarySlipImage: z.string().trim().min(1).max(500),
  apartmentContractImage: z.string().trim().min(1).max(500),
  guarantorName: z.string().trim().min(1).max(200),
  guarantorPhone: z.string().trim().min(5).max(20),
  guarantorAddress: z.string().trim().max(5000).optional(),
  guarantorNationalIdImage: z.string().trim().min(1).max(500),
  downPayment: money,
  monthlyInstallment: money,
});

export const installmentCalculationSchema = z.object({
  motorcycleId: uuid,
  downPayment: money,
  installmentDurationId: uuid,
});

export const installmentRequestReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  rejectionReason: z.string().trim().max(5000).optional(),
});

export const installmentRequestUpdateSchema = z.object({
  buyerName: z.string().trim().min(1).max(200).optional(),
  buyerPhone: z.string().trim().min(5).max(20).optional(),
  financingCompanyId: uuid.optional(),
  downPayment: money.optional(),
});

export type FinancingCompanyCreate = z.infer<typeof financingCompanyCreateSchema>;
export type FinancingCompanyUpdate = z.infer<typeof financingCompanyUpdateSchema>;
export type InstallmentDurationCreate = z.infer<typeof installmentDurationCreateSchema>;
export type InstallmentDurationUpdate = z.infer<typeof installmentDurationUpdateSchema>;
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
export type InstallmentRequestCreate = z.infer<typeof installmentRequestCreateSchema>;
export type InstallmentCalculation = z.infer<typeof installmentCalculationSchema>;
export type InstallmentRequestReview = z.infer<typeof installmentRequestReviewSchema>;
export type InstallmentRequestUpdate = z.infer<typeof installmentRequestUpdateSchema>;
