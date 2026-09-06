import { z } from "zod";
import type { Address } from "./address.js";

// Base schemas
const nameSchema = z.string().trim().min(2, "Name must be at least 2 characters").max(200, "Name is too long");
const emailSchema = z.string().trim().email("Invalid email format").max(255, "Email is too long");
const nationalIdSchema = z.string().trim().regex(/^[a-zA-Z0-9]+$/, "National ID must be alphanumeric").max(20, "National ID is too long");
const notesSchema = z.string().max(2000, "Notes are too long");
const passwordSchema = z.string().min(8, "Password must be at least 8 characters");
const uuidSchema = z.string().uuid();

// Phone validation schema - accepts international format or 9-15 digits
const phoneRawSchema = z.string().trim().min(1, "Phone is required");

// Phone normalization utility
export function normalizePhone(phone: string): string {
  // Remove spaces and dashes
  let normalized = phone.replace(/[\s-]/g, "");
  
  // Preserve international format (starts with +)
  // Validation: must start with + or be 9-15 digits
  if (!normalized.startsWith("+") && !/^\d{9,15}$/.test(normalized)) {
    throw new Error("Invalid phone format");
  }
  
  return normalized;
}

// Phone schema with normalization
export const phoneSchema = phoneRawSchema.transform((val) => normalizePhone(val));

// Customer interface
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  passwordHash?: string | null;
  nationalId?: string | null;
  address?: string | null; // Legacy field
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Customer with addresses (for detail views)
export interface CustomerWithAddresses extends Customer {
  addresses: Address[];
}

// Customer list item (for paginated lists)
export interface CustomerListItem {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  nationalId?: string | null; // Masked in list views
  isActive: boolean;
  orderCount?: number;
  lastOrderDate?: string | null;
  createdAt: string;
}

// Customer search result (for POS)
export interface CustomerSearchResult {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  nationalId?: string | null; // Masked
  defaultAddress?: {
    id: string;
    addressLine: string;
    city?: string | null;
  } | null;
}

// Customer stats (for detail views)
export interface CustomerStats {
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: string | null;
  activeReservations: number;
  activeInstallmentPlans: number;
}

// Customer detail response
export interface CustomerDetailResponse extends CustomerWithAddresses {
  stats?: CustomerStats;
}

// RegisterCustomerDto (e-commerce self-registration)
export const registerCustomerSchema = z
  .object({
    name: nameSchema,
    phone: phoneSchema,
    email: emailSchema,
    password: passwordSchema,
    nationalId: nationalIdSchema.optional(),
    address: z
      .object({
        label: z.string().max(100).optional(),
        addressLine: z.string().trim().min(1, "Address line is required").max(500),
        city: z.string().max(100).optional(),
        region: z.string().max(100).optional(),
        postalCode: z.string().max(20).optional(),
        country: z.string().max(100).optional(),
      })
      .optional(),
  })
  .strict();

export type RegisterCustomerDto = z.infer<typeof registerCustomerSchema>;

// CreateCustomerDto (staff creation - POS/Admin)
export const createCustomerSchema = z
  .object({
    name: nameSchema,
    phone: phoneSchema,
    email: emailSchema.optional(),
    nationalId: nationalIdSchema.optional(),
    notes: notesSchema.optional(),
    address: z
      .object({
        label: z.string().max(100).optional(),
        addressLine: z.string().trim().min(1, "Address line is required").max(500),
        city: z.string().max(100).optional(),
        region: z.string().max(100).optional(),
        postalCode: z.string().max(20).optional(),
        country: z.string().max(100).optional(),
      })
      .optional(),
  })
  .strict();

export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;

// UpdateCustomerDto
export const updateCustomerSchema = z
  .object({
    name: nameSchema.optional(),
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    nationalId: nationalIdSchema.optional(),
    notes: notesSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;

// CustomerSearchDto (for POS search)
export const customerSearchSchema = z
  .object({
    q: z.string().trim().min(1, "Search query is required"),
    limit: z.coerce.number().int().positive().max(20).default(10),
  })
  .strict();

export type CustomerSearchDto = z.infer<typeof customerSearchSchema>;

// Customer list query schema
export const listCustomersQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().optional(),
    hasEmail: z.coerce.boolean().optional(),
    hasNationalId: z.coerce.boolean().optional(),
    isActive: z.coerce.boolean().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    sort: z.enum(["name", "createdAt"]).default("createdAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

// Change password schema (e-commerce)
export const changeCustomerPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
  })
  .strict();

export type ChangeCustomerPasswordDto = z.infer<typeof changeCustomerPasswordSchema>;

// Deactivate customer schema
export const deactivateCustomerSchema = z
  .object({
    reason: z.string().trim().min(1, "Reason is required"),
  })
  .strict();

export type DeactivateCustomerDto = z.infer<typeof deactivateCustomerSchema>;

// Customer summary (order/payment stats)
export interface CustomerSummary {
  customerId: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalSpent: number;
  totalPaid: number;
  outstandingBalance: number;
  activeReservations: number;
  expiredReservations: number;
  activeInstallmentPlans: number;
  overdueInstallments: number;
  lastOrderDate?: string | null;
  lastPaymentDate?: string | null;
}
