import { z } from "zod";
import { languageSchema, type Language } from "./enums.js";
import type { RolePermissionInput } from "./role.js";
import type { BranchSummary } from "./user.js";

const emailSchema = z.string().trim().email().max(255);
const passwordSchema = z.string().min(8);
const nameSchema = z.string().trim().min(1).max(200);
const phoneSchema = z.string().trim().max(20);

export const registerRequestSchema = z
  .object({
    name: nameSchema,
    phone: phoneSchema,
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const loginRequestSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1),
  })
  .strict();

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  })
  .strict();

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface RegisterResponse {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface AuthRole {
  id: string;
  name: string;
  permissions: RolePermissionInput[];
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  branchId?: string | null;
  lang: Language;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RefreshTokenResponse {
  accessToken: string;
}

export interface CurrentUserResponse extends AuthUser {
  phone?: string | null;
  branch?: BranchSummary | null;
  lastLoginAt?: string | null;
}

export type LogoutResponse = null;
export type ChangePasswordResponse = null;

export const currentUserResponseSchema = z.object({
  id: z.string().uuid(),
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional().nullable(),
  role: z.object({
    id: z.string().uuid(),
    name: z.string(),
    permissions: z.array(
      z.object({
        resource: z.string(),
        action: z.string(),
      }),
    ),
  }),
  branchId: z.string().uuid().optional().nullable(),
  branch: z
    .object({
      id: z.string().uuid(),
      nameAr: z.string(),
      nameEn: z.string(),
    })
    .optional()
    .nullable(),
  lang: languageSchema,
  lastLoginAt: z.string().datetime().optional().nullable(),
});
