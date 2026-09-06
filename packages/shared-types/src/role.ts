import { z } from "zod";
import { actionSchema, type Action, resourceSchema, type Resource } from "./enums.js";

const roleNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_ ]+$/);

export const rolePermissionInputSchema = z.object({
  resource: resourceSchema,
  action: actionSchema,
});

const uniquePermissions = <T extends { resource: Resource; action: Action }[]>(permissions: T) => {
  const keys = new Set(permissions.map((permission) => `${permission.resource}:${permission.action}`));
  return keys.size === permissions.length;
};

export const createRoleRequestSchema = z
  .object({
    name: roleNameSchema,
    description: z.string().trim().optional(),
    permissions: z.array(rolePermissionInputSchema).refine(uniquePermissions, {
      message: "Role permissions must not contain duplicates",
    }),
  })
  .strict();

export const updateRoleRequestSchema = z
  .object({
    name: roleNameSchema.optional(),
    description: z.string().trim().optional(),
    permissions: z
      .array(rolePermissionInputSchema)
      .refine(uniquePermissions, {
        message: "Role permissions must not contain duplicates",
      })
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export interface RolePermission {
  id: string;
  roleId: string;
  resource: Resource;
  action: Action;
}

export interface RolePermissionInput {
  resource: Resource;
  action: Action;
}

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoleWithPermissions extends Role {
  permissions: RolePermission[];
}

export interface RoleListItem extends Role {
  _count: {
    users: number;
    permissions: number;
  };
}

export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;

export interface CreateRoleResponse {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissions: RolePermissionInput[];
  createdAt: string;
}

export type UpdateRoleResponse = RoleWithPermissions;
