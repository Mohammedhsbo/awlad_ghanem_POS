import { z } from "zod";

const nameArSchema = z.string().trim().min(1).max(200);
const nameEnSchema = z.string().trim().min(1).max(200);
const logoSchema = z.string().trim().url().max(500);
const uuidSchema = z.string().uuid();
const sortOrderSchema = z.number().int().default(0);

export const createBrandRequestSchema = z
  .object({
    nameAr: nameArSchema,
    nameEn: nameEnSchema,
    logo: logoSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .strict();

export const updateBrandRequestSchema = z
  .object({
    nameAr: nameArSchema.optional(),
    nameEn: nameEnSchema.optional(),
    logo: logoSchema.optional(),
    isActive: z.boolean().optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const listBrandsQuerySchema = z
  .object({
    isActive: z.coerce.boolean().optional(),
  })
  .strict();

export interface Brand {
  id: string;
  nameAr: string;
  nameEn: string;
  logo?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BrandListItem extends Brand {
  _count?: {
    motorcycles: number;
  };
}

export interface BrandSummary {
  id: string;
  nameAr: string;
  nameEn: string;
  logo?: string | null;
}

export type CreateBrandRequest = z.infer<typeof createBrandRequestSchema>;
export type UpdateBrandRequest = z.infer<typeof updateBrandRequestSchema>;
export type ListBrandsQuery = z.infer<typeof listBrandsQuerySchema>;

export interface CreateBrandResponse {
  id: string;
  nameAr: string;
  nameEn: string;
  logo?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export type UpdateBrandResponse = Brand;
export type GetBrandResponse = BrandListItem;