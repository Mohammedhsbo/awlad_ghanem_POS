import { z } from "zod";

const nameArSchema = z.string().trim().min(1).max(200);
const nameEnSchema = z.string().trim().min(1).max(200);
const uuidSchema = z.string().uuid();
const sortOrderSchema = z.number().int().default(0);

export const createCategoryRequestSchema = z
  .object({
    nameAr: nameArSchema,
    nameEn: nameEnSchema,
    parentId: uuidSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .strict();

export const updateCategoryRequestSchema = z
  .object({
    nameAr: nameArSchema.optional(),
    nameEn: nameEnSchema.optional(),
    parentId: uuidSchema.nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const listCategoriesQuerySchema = z
  .object({
    isActive: z.coerce.boolean().optional(),
    flat: z.coerce.boolean().default(false),
  })
  .strict();

export interface Category {
  id: string;
  nameAr: string;
  nameEn: string;
  parentId?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryTreeItem extends Category {
  children?: CategoryTreeItem[];
  _count?: {
    motorcycles: number;
  };
}

export interface CategoryFlatItem extends Category {
  depth: number;
  path: string;
  _count?: {
    motorcycles: number;
  };
}

export interface CategoryWithRelations extends Category {
  parent?: CategorySummary | null;
  children: CategorySummary[];
  _count: {
    motorcycles: number;
  };
}

export interface CategorySummary {
  id: string;
  nameAr: string;
  nameEn: string;
  sortOrder?: number;
}

export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;

export interface CreateCategoryResponse {
  id: string;
  nameAr: string;
  nameEn: string;
  parentId?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export type UpdateCategoryResponse = Category;
export type GetCategoryResponse = CategoryWithRelations;