import { z } from "zod";

// Address interface
export interface Address {
  id: string;
  customerId: string;
  label: string;
  addressLine: string;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country: string;
  isDefault: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

// CreateAddressDto
export const createAddressSchema = z
  .object({
    label: z.string().trim().max(100, "Label is too long").default("Home"),
    addressLine: z.string().trim().min(1, "Address line is required").max(500, "Address line is too long"),
    city: z.string().trim().max(100, "City is too long").optional(),
    region: z.string().trim().max(100, "Region is too long").optional(),
    postalCode: z.string().trim().max(20, "Postal code is too long").optional(),
    country: z.string().trim().max(100, "Country is too long").default("Saudi Arabia"),
    isDefault: z.boolean().default(false),
    notes: z.string().trim().max(500, "Notes are too long").optional(),
  })
  .strict();

export type CreateAddressDto = z.infer<typeof createAddressSchema>;

// UpdateAddressDto
export const updateAddressSchema = z
  .object({
    label: z.string().trim().max(100, "Label is too long").optional(),
    addressLine: z.string().trim().min(1, "Address line is required").max(500, "Address line is too long").optional(),
    city: z.string().trim().max(100, "City is too long").optional(),
    region: z.string().trim().max(100, "Region is too long").optional(),
    postalCode: z.string().trim().max(20, "Postal code is too long").optional(),
    country: z.string().trim().max(100, "Country is too long").optional(),
    isDefault: z.boolean().optional(),
    notes: z.string().trim().max(500, "Notes are too long").optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export type UpdateAddressDto = z.infer<typeof updateAddressSchema>;

// Address list item (simplified for listings)
export interface AddressListItem {
  id: string;
  label: string;
  addressLine: string;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country: string;
  isDefault: boolean;
  notes?: string | null;
  createdAt: string;
}
