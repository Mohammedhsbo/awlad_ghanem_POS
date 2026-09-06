import { z } from "zod";
import { motorcycleStatusSchema, type MotorcycleStatus } from "./enums.js";
import type { BrandSummary } from "./brand.js";
import type { CategorySummary } from "./category.js";
import type { BranchSummary } from "./user.js";

const vinSchema = z.string().trim().min(1).max(50).regex(/^[A-HJ-NPR-Z0-9-]+$/, {
  message: "VIN must contain only uppercase letters (excluding I, O and Q), digits and hyphens",
});
const engineNumberSchema = z.string().trim().max(100).optional();
const modelSchema = z.string().trim().min(1).max(200);
const yearSchema = z.number().int().min(1900).max(2100);
const colorSchema = z.string().trim().max(50);
const engineSizeSchema = z.string().trim().max(20);
const descriptionSchema = z.string().trim().max(5000);
const priceSchema = z.number().positive().multipleOf(0.01);
const costPriceSchema = z.number().nonnegative().multipleOf(0.01);
const uuidSchema = z.string().uuid();
const imagesSchema = z.array(z.string().url()).max(10);

export const createMotorcycleRequestSchema = z
  .object({
    vin: vinSchema,
    engineNumber: engineNumberSchema,
    model: modelSchema,
    year: yearSchema,
    color: colorSchema.optional(),
    engineSize: engineSizeSchema.optional(),
    descriptionAr: descriptionSchema.optional(),
    descriptionEn: descriptionSchema.optional(),
    price: priceSchema,
    costPrice: costPriceSchema,
    brandId: uuidSchema,
    categoryId: uuidSchema,
    branchId: uuidSchema,
    images: imagesSchema.default([]),
    status: motorcycleStatusSchema.optional(),
  })
  .strict();

export const updateMotorcycleRequestSchema = z
  .object({
    vin: vinSchema.optional(),
    model: modelSchema.optional(),
    year: yearSchema.optional(),
    color: colorSchema.optional(),
    engineNumber: engineNumberSchema,
    engineSize: engineSizeSchema.optional(),
    descriptionAr: descriptionSchema.optional(),
    descriptionEn: descriptionSchema.optional(),
    price: priceSchema.optional(),
    costPrice: costPriceSchema.optional(),
    brandId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
    images: imagesSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const statusTransitionRequestSchema = z
  .object({
    status: motorcycleStatusSchema,
    reason: z.string().trim().optional(),
  })
  .strict();

export const listMotorcyclesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().optional(),
    brandId: uuidSchema.optional(),
    categoryId: uuidSchema.optional(),
    branchId: uuidSchema.optional(),
    status: motorcycleStatusSchema.optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().positive().optional(),
    minYear: z.coerce.number().int().min(1900).optional(),
    maxYear: z.coerce.number().int().max(2100).optional(),
    color: colorSchema.optional(),
    sort: z
      .enum(["price", "year", "createdAt", "model"])
      .default("createdAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict()
  .refine(
    (data) => {
      if (data.minPrice !== undefined && data.maxPrice !== undefined) {
        return data.minPrice <= data.maxPrice;
      }
      return true;
    },
    {
      message: "minPrice must be less than or equal to maxPrice",
    },
  )
  .refine(
    (data) => {
      if (data.minYear !== undefined && data.maxYear !== undefined) {
        return data.minYear <= data.maxYear;
      }
      return true;
    },
    {
      message: "minYear must be less than or equal to maxYear",
    },
  );

export interface Motorcycle {
  id: string;
  vin: string;
  engineNumber?: string | null;
  model: string;
  year: number;
  color?: string | null;
  engineSize?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  price: number;
  costPrice: number;
  status: MotorcycleStatus;
  images: string[];
  branchId: string;
  brandId: string;
  categoryId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MotorcycleListItem {
  id: string;
  vin: string;
  engineNumber?: string | null;
  model: string;
  year: number;
  color?: string | null;
  engineSize?: string | null;
  price: number;
  brand: BrandSummary;
  category: CategorySummary;
  branch: BranchSummary;
  status: MotorcycleStatus;
  images: string[];
  createdAt: string;
}

export interface MotorcycleDetails extends Motorcycle {
  brand: BrandSummary;
  category: CategorySummary;
  branch: BranchSummary;
}

export interface MotorcycleStatusHistory {
  id: string;
  action: string;
  before: {
    status: MotorcycleStatus;
  };
  after: {
    status: MotorcycleStatus;
  };
  user: {
    id: string;
    name: string;
  };
  reason?: string | null;
  createdAt: string;
}

export interface InventorySummaryByBranch {
  branchId: string;
  branch: BranchSummary;
  statusCounts: Record<MotorcycleStatus, number>;
  total: number;
}

export type CreateMotorcycleRequest = z.infer<typeof createMotorcycleRequestSchema>;
export type UpdateMotorcycleRequest = z.infer<typeof updateMotorcycleRequestSchema>;
export type StatusTransitionRequest = z.infer<typeof statusTransitionRequestSchema>;
export type ListMotorcyclesQuery = z.infer<typeof listMotorcyclesQuerySchema>;

export interface CreateMotorcycleResponse {
  id: string;
  vin: string;
  engineNumber?: string | null;
  model: string;
  year: number;
  color?: string | null;
  engineSize?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  price: number;
  costPrice: number;
  brand: BrandSummary;
  category: CategorySummary;
  branch: BranchSummary;
  status: MotorcycleStatus;
  images: string[];
  createdAt: string;
}

export interface StatusTransitionResponse {
  id: string;
  vin: string;
  model: string;
  status: MotorcycleStatus;
  previousStatus: MotorcycleStatus;
  updatedAt: string;
}

export type UpdateMotorcycleResponse = CreateMotorcycleResponse;
export type GetMotorcycleResponse = MotorcycleDetails;