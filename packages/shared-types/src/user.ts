import { z } from "zod";
import { Language, languageSchema } from "./enums.js";
import type { RoleListItem } from "./role.js";

const nameSchema = z.string().trim().min(1).max(200);
const emailSchema = z.string().trim().email().max(255);
const phoneSchema = z.string().trim().max(20);
const passwordSchema = z.string().min(8);
const uuidSchema = z.string().uuid();

export const createUserRequestSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    phone: phoneSchema.optional(),
    whatsappSenderNumber: phoneSchema.optional(),
    roleId: uuidSchema,
    branchId: uuidSchema.optional(),
    lang: languageSchema.default(Language.AR),
  })
  .strict();

export const updateUserRequestSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    whatsappSenderNumber: phoneSchema.optional(),
    roleId: uuidSchema.optional(),
    branchId: uuidSchema.optional(),
    isActive: z.boolean().optional(),
    lang: languageSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const selfUpdateUserRequestSchema = z
  .object({
    name: nameSchema.optional(),
    phone: phoneSchema.optional(),
    whatsappSenderNumber: phoneSchema.optional(),
    currentPassword: passwordSchema.optional(),
    newPassword: passwordSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  })
  .refine((data) => Boolean(data.currentPassword) === Boolean(data.newPassword), {
    message: "Current and new password are required together",
    path: ["newPassword"],
  });

export const resetPasswordRequestSchema = z
  .object({
    newPassword: passwordSchema,
  })
  .strict();

export const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().optional(),
    roleId: uuidSchema.optional(),
    branchId: uuidSchema.optional(),
    isActive: z.coerce.boolean().optional(),
  })
  .strict();

export interface Branch {
  id: string;
  nameAr: string;
  nameEn: string;
  address?: string | null;
  phone?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BranchSummary {
  id: string;
  nameAr: string;
  nameEn: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  phone?: string | null;
  whatsappSenderNumber?: string | null;
  branchId?: string | null;
  roleId: string;
  lang: Language;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserListItem {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  whatsappSenderNumber?: string | null;
  role: Pick<RoleListItem, "id" | "name">;
  branch?: BranchSummary | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  whatsappSenderNumber?: string | null;
  roleId: string;
  branchId?: string | null;
  lang: Language;
  isActive: boolean;
  createdAt: string;
}

export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type SelfUpdateUserRequest = z.infer<typeof selfUpdateUserRequestSchema>;
