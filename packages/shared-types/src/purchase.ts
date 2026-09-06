import { z } from "zod";
import { purchaseStatusSchema } from "./enums.js";

export const purchaseItemSchema = z.object({
  id: z.string().uuid(),
  purchaseId: z.string().uuid(),
  motorcycleId: z.string().uuid().optional().nullable(),
  model: z.string().max(200, "Model is too long"),
  vin: z.string().max(50, "VIN is too long").optional().nullable(),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  unitCost: z.number().min(0, "Cost must be positive"),
  createdAt: z.coerce.date(),
});

export type PurchaseItem = z.infer<typeof purchaseItemSchema>;

export const purchaseSchema = z.object({
  id: z.string().uuid(),
  purchaseNumber: z.string().max(50),
  supplierId: z.string().uuid(),
  branchId: z.string().uuid(),
  userId: z.string().uuid(),
  totalAmount: z.number().min(0),
  status: purchaseStatusSchema,
  receivedAt: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  items: z.array(purchaseItemSchema).optional(),
});

export type Purchase = z.infer<typeof purchaseSchema>;

export const createPurchaseItemRequestSchema = z.object({
  model: z.string().min(1, "Model is required").max(200, "Model is too long"),
  vin: z.string().max(50, "VIN is too long").optional(),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  unitCost: z.number().min(0, "Cost must be positive"),
});

export type CreatePurchaseItemRequest = z.infer<typeof createPurchaseItemRequestSchema>;

export const createPurchaseSchema = z.object({
  supplierId: z.string().uuid("Invalid supplier ID"),
  branchId: z.string().uuid("Invalid branch ID").optional(),
  notes: z.string().optional(),
  items: z.array(createPurchaseItemRequestSchema).min(1, "At least one item is required"),
});

export type CreatePurchaseRequest = z.infer<typeof createPurchaseSchema>;

export const updatePurchaseSchema = z.object({
  supplierId: z.string().uuid("Invalid supplier ID").optional(),
  notes: z.string().optional(),
  items: z.array(createPurchaseItemRequestSchema).optional(),
});

export type UpdatePurchaseRequest = z.infer<typeof updatePurchaseSchema>;

export const receivePurchaseItemSchema = z.object({
  purchaseItemId: z.string().uuid("Invalid item ID"),
  vin: z.string().min(1, "VIN is required"),
});

export const receivePurchaseSchema = z.object({
  items: z.array(receivePurchaseItemSchema).min(1, "At least one item must be received"),
});

export type ReceivePurchaseRequest = z.infer<typeof receivePurchaseSchema>;
