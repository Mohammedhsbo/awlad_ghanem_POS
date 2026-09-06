import { z } from "zod";

export const supplierSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(200, "Name is too long"),
  contactPerson: z.string().max(200, "Contact person name is too long").optional().nullable(),
  phone: z.string().max(20, "Phone number is too long").optional().nullable(),
  email: z.string().email("Invalid email format").optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Supplier = z.infer<typeof supplierSchema>;

export const createSupplierSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name is too long"),
  contactPerson: z.string().max(200, "Contact person name is too long").optional(),
  phone: z.string().max(20, "Phone number is too long").optional(),
  email: z.string().email("Invalid email format").optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateSupplierRequest = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type UpdateSupplierRequest = z.infer<typeof updateSupplierSchema>;
