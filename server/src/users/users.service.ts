import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  CreateUserRequest,
  Language,
  ListUsersQuery,
  ResetPasswordRequest,
  SelfUpdateUserRequest,
  UpdateUserRequest,
  UserListItem,
  UserResponse,
} from "@motorcycle-system/shared-types";
import { AuditService } from "../audit/audit.service.js";
import { AppError } from "../common/errors/app-error.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { TokenStoreService } from "../token-store/token-store.service.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

const userListInclude = {
  include: {
    role: {
      select: {
        id: true,
        name: true,
      },
    },
    branch: {
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
      },
    },
  },
} satisfies Prisma.UserDefaultArgs;

type UserListRecord = Prisma.UserGetPayload<typeof userListInclude>;

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TokenStoreService) private readonly tokenStore: TokenStoreService,
  ) {}

  async create(input: CreateUserRequest, actor: AuthenticatedUser): Promise<UserResponse> {
    if (actor.roleName !== "super_admin") {
      throw new AppError("FORBIDDEN", 403, "Only super_admin can create staff users");
    }

    const email = input.email.toLowerCase();
    await this.assertEmailAvailable(email);
    const whatsappSenderNumber = this.normalizeWhatsappNumber(input.whatsappSenderNumber);
    await this.assertWhatsappNumberAvailable(whatsappSenderNumber);

    const role = await this.prisma.role.findUnique({ where: { id: input.roleId } });
    if (!role || role.name === "customer") {
      throw new AppError("ROLE_NOT_FOUND", 422, "Staff role is invalid");
    }

    const branchId = input.branchId ?? null;
    this.assertActorCanUseBranch(actor, branchId);
    await this.assertBranchRequirement(role.name, branchId);

    const user = await this.prisma.user.create({
      data: {
        name: input.name,
        email,
        passwordHash: await hashPassword(input.password),
        phone: input.phone,
        whatsappSenderNumber,
        roleId: role.id,
        branchId,
        lang: input.lang ?? "ar",
      },
    });

    await this.audit.log({
      userId: actor.id,
      action: "user.create",
      entityType: "user",
      entityId: user.id,
      branchId: user.branchId,
      after: this.auditUser(user),
    });

    return this.toUserResponse(user);
  }

  async list(query: ListUsersQuery, actor: AuthenticatedUser) {
    const where: Prisma.UserWhereInput = {
      role: {
        name: {
          not: "customer",
        },
      },
      ...this.scopedWhere(actor),
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ];
    }
    if (query.roleId) {
      where.roleId = query.roleId;
    }
    if (query.branchId) {
      if (actor.branchId && query.branchId !== actor.branchId) {
        throw new AppError("BRANCH_SCOPE_VIOLATION", 403, "Branch scope violation");
      }
      where.branchId = query.branchId;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const skip = (query.page - 1) * query.limit;
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        ...userListInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
    ]);

    return {
      data: users.map((user) => this.toUserListItem(user)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getById(id: string, actor: AuthenticatedUser): Promise<UserListItem> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      ...userListInclude,
    });

    if (!user || user.role.name === "customer") {
      throw new AppError("USER_NOT_FOUND", 404, "User not found");
    }

    this.assertActorCanAccessUser(actor, user);
    return this.toUserListItem(user);
  }

  async update(id: string, input: UpdateUserRequest, actor: AuthenticatedUser): Promise<UserListItem> {
    const current = await this.prisma.user.findUnique({
      where: { id },
      ...userListInclude,
    });

    if (!current || current.role.name === "customer") {
      throw new AppError("USER_NOT_FOUND", 404, "User not found");
    }

    this.assertActorCanAccessUser(actor, current);
    this.assertCanModifyTarget(actor, current);

    if (id === actor.id && input.roleId && input.roleId !== current.roleId) {
      throw new AppError("CANNOT_MODIFY_OWN_ROLE", 403, "Cannot modify own role");
    }
    if (id === actor.id && input.isActive === false) {
      throw new AppError("CANNOT_DEACTIVATE_OWN_ACCOUNT", 403, "Cannot deactivate own account");
    }
    if (input.email && input.email.toLowerCase() !== current.email.toLowerCase()) {
      await this.assertEmailAvailable(input.email.toLowerCase(), id);
    }
    if (input.whatsappSenderNumber !== undefined) {
      await this.assertWhatsappNumberAvailable(this.normalizeWhatsappNumber(input.whatsappSenderNumber), id);
    }

    const nextRole = input.roleId
      ? await this.prisma.role.findUnique({ where: { id: input.roleId } })
      : current.role;
    if (!nextRole || nextRole.name === "customer") {
      throw new AppError("ROLE_NOT_FOUND", 422, "Staff role is invalid");
    }

    const nextBranchId = input.branchId !== undefined ? input.branchId : current.branchId;
    this.assertActorCanUseBranch(actor, nextBranchId);
    await this.assertBranchRequirement(nextRole.name, nextBranchId);

    if (current.role.name === "super_admin" && input.isActive === false) {
      await this.assertNotLastActiveSuperAdmin(id);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: input.name,
        email: input.email?.toLowerCase(),
        phone: input.phone,
        whatsappSenderNumber: input.whatsappSenderNumber === undefined
          ? undefined
          : this.normalizeWhatsappNumber(input.whatsappSenderNumber),
        roleId: input.roleId,
        branchId: input.branchId,
        isActive: input.isActive,
        lang: input.lang,
      },
      ...userListInclude,
    });

    if (input.isActive === false || input.roleId) {
      await this.tokenStore.deleteRefreshTokensForUser(id);
    }

    await this.audit.log({
      userId: actor.id,
      action: "user.update",
      entityType: "user",
      entityId: updated.id,
      branchId: updated.branchId,
      before: this.auditUser(current),
      after: this.auditUser(updated),
    });

    return this.toUserListItem(updated);
  }

  async delete(id: string, actor: AuthenticatedUser) {
    const current = await this.prisma.user.findUnique({
      where: { id },
      ...userListInclude,
    });

    if (!current || current.role.name === "customer") {
      throw new AppError("USER_NOT_FOUND", 404, "User not found");
    }

    this.assertActorCanAccessUser(actor, current);
    if (id === actor.id) {
      throw new AppError("CANNOT_DELETE_OWN_ACCOUNT", 403, "Cannot delete own account");
    }
    if (current.role.name === "super_admin") {
      throw new AppError("SYSTEM_ROLE_PROTECTED", 403, "Cannot delete super_admin");
    }

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      if (this.isPrismaConflict(error)) {
        throw new AppError("USER_HAS_RECORDS", 409, "User has associated records");
      }
      throw error;
    }

    await this.tokenStore.deleteRefreshTokensForUser(id);
    await this.audit.log({
      userId: actor.id,
      action: "user.delete",
      entityType: "user",
      entityId: id,
      branchId: current.branchId,
      before: this.auditUser(current),
    });
  }

  async resetPassword(id: string, input: ResetPasswordRequest, actor: AuthenticatedUser) {
    const current = await this.prisma.user.findUnique({
      where: { id },
      ...userListInclude,
    });

    if (!current || current.role.name === "customer") {
      throw new AppError("USER_NOT_FOUND", 404, "User not found");
    }

    this.assertActorCanAccessUser(actor, current);
    this.assertCanModifyTarget(actor, current);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(input.newPassword),
      },
    });
    await this.tokenStore.deleteRefreshTokensForUser(id);

    await this.audit.log({
      userId: actor.id,
      action: "user.reset_password",
      entityType: "user",
      entityId: id,
      branchId: current.branchId,
      before: this.auditUser(current),
      after: { passwordReset: true },
    });
  }

  async getMe(id: string): Promise<UserListItem> {
    const user = await this.prisma.user.findUnique({ where: { id }, ...userListInclude });
    if (!user) {
      throw new AppError("USER_NOT_FOUND", 404, "User not found");
    }
    return this.toUserListItem(user);
  }

  async updateMe(id: string, input: SelfUpdateUserRequest): Promise<UserListItem> {
    const current = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, passwordHash: true, whatsappSenderNumber: true },
    });

    if (!current) {
      throw new AppError("USER_NOT_FOUND", 404, "User not found");
    }

    const phone = input.phone === undefined ? undefined : input.phone.trim() || null;
    if (phone !== undefined) {
      const existing = await this.prisma.user.findFirst({ where: { phone, id: { not: id } }, select: { id: true } });
      if (existing) {
        throw new AppError("PHONE_EXISTS", 409, "Phone already exists");
      }
    }

    const whatsappSenderNumber = input.whatsappSenderNumber === undefined
      ? undefined
      : this.normalizeWhatsappNumber(input.whatsappSenderNumber);
    if (whatsappSenderNumber !== undefined) {
      await this.assertWhatsappNumberAvailable(whatsappSenderNumber, id);
    }

    if (input.newPassword) {
      const passwordMatches = await verifyPassword(input.currentPassword!, current.passwordHash);
      if (!passwordMatches) {
        throw new AppError("INVALID_CURRENT_PASSWORD", 422, "Current password is incorrect");
      }
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        name: input.name,
        phone,
        whatsappSenderNumber,
        ...(input.newPassword ? { passwordHash: await hashPassword(input.newPassword) } : {}),
      },
    });

    if (input.newPassword) {
      await this.tokenStore.deleteRefreshTokensForUser(id);
    }

    return this.getMe(id);
  }

  private assertActorCanAccessUser(actor: AuthenticatedUser, user: { branchId: string | null }) {
    if (actor.branchId && user.branchId !== actor.branchId) {
      throw new AppError("BRANCH_SCOPE_VIOLATION", 403, "Branch scope violation");
    }
  }

  private assertActorCanUseBranch(actor: AuthenticatedUser, branchId: string | null) {
    if (actor.branchId && branchId !== actor.branchId) {
      throw new AppError("BRANCH_SCOPE_VIOLATION", 403, "Branch scope violation");
    }
  }

  private assertCanModifyTarget(actor: AuthenticatedUser, user: UserListRecord) {
    if (user.role.name === "super_admin" && actor.id !== user.id) {
      throw new AppError("SYSTEM_ROLE_PROTECTED", 403, "Cannot modify super_admin");
    }
  }

  private async assertBranchRequirement(roleName: string, branchId: string | null) {
    if (roleName !== "super_admin" && !branchId) {
      throw new AppError("BRANCH_REQUIRED", 422, "Branch is required for staff users");
    }
    if (!branchId) {
      return;
    }

    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || !branch.isActive) {
      throw new AppError("BRANCH_NOT_FOUND", 422, "Branch is invalid");
    }
  }

  private async assertEmailAvailable(email: string, excludeUserId?: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        id: excludeUserId ? { not: excludeUserId } : undefined,
      },
    });

    if (existing) {
      throw new AppError("EMAIL_EXISTS", 409, "Email already exists");
    }
  }

  private normalizeWhatsappNumber(value: string | undefined) {
    const normalized = value?.trim();
    return normalized || null;
  }

  private async assertWhatsappNumberAvailable(number: string | null, excludeUserId?: string) {
    if (!number) return;

    const existing = await this.prisma.user.findFirst({
      where: {
        whatsappSenderNumber: number,
        id: excludeUserId ? { not: excludeUserId } : undefined,
      },
      select: { id: true },
    });

    if (existing) {
      throw new AppError("WHATSAPP_NUMBER_TAKEN", 409, "WhatsApp sender number is already in use");
    }
  }

  private async assertNotLastActiveSuperAdmin(userId: string) {
    const count = await this.prisma.user.count({
      where: {
        id: { not: userId },
        isActive: true,
        role: {
          name: "super_admin",
        },
      },
    });

    if (count === 0) {
      throw new AppError("LAST_SUPER_ADMIN", 403, "Cannot deactivate the last active super_admin");
    }
  }

  private scopedWhere(actor: AuthenticatedUser): Prisma.UserWhereInput {
    if (!actor.branchId) {
      return {};
    }

    return { branchId: actor.branchId };
  }

  private toUserListItem(user: UserListRecord): UserListItem {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      whatsappSenderNumber: user.whatsappSenderNumber,
      role: user.role,
      branch: user.branch,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private toUserResponse(user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    whatsappSenderNumber: string | null;
    roleId: string;
    branchId: string | null;
    lang: string;
    isActive: boolean;
    createdAt: Date;
  }): UserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      whatsappSenderNumber: user.whatsappSenderNumber,
      roleId: user.roleId,
      branchId: user.branchId,
      lang: user.lang as Language,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private auditUser(user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    whatsappSenderNumber: string | null;
    roleId: string;
    branchId: string | null;
    lang: string;
    isActive: boolean;
  }): Prisma.InputJsonObject {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      roleId: user.roleId,
      branchId: user.branchId,
      lang: user.lang,
      isActive: user.isActive,
    };
  }

  private isPrismaConflict(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2014"].includes(error.code);
  }
}
