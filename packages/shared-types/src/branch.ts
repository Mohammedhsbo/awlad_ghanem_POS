import { z } from "zod";

const branchNameSchema = z.string().trim().min(1).max(200);
const phoneSchema = z.string().trim().max(20).optional();
const addressSchema = z.string().trim().max(500).optional();
const uuidSchema = z.string().uuid();

export const createBranchRequestSchema = z
  .object({
    nameAr: branchNameSchema,
    nameEn: branchNameSchema,
    address: addressSchema,
    phone: phoneSchema,
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const updateBranchRequestSchema = z
  .object({
    nameAr: branchNameSchema.optional(),
    nameEn: branchNameSchema.optional(),
    address: addressSchema,
    phone: phoneSchema,
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const listBranchesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().optional(),
    isActive: z.coerce.boolean().optional(),
  })
  .strict();

export type CreateBranchRequest = z.infer<typeof createBranchRequestSchema>;
export type UpdateBranchRequest = z.infer<typeof updateBranchRequestSchema>;
export type ListBranchesQuery = z.infer<typeof listBranchesQuerySchema>;

export const branchIdSchema = uuidSchema;
