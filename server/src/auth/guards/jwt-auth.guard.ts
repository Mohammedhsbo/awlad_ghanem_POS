import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Prisma, type Customer } from "@prisma/client";
import type { Action, Language, Resource } from "@motorcycle-system/shared-types";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AppError } from "../../common/errors/app-error.js";
import type { AuthenticatedRequest, AuthenticatedUser } from "../../common/types/authenticated-request.js";
import { verifyToken } from "../../utils/jwt.js";

const userWithRole = {
  include: {
    branch: true,
    role: {
      include: {
        permissions: true,
      },
    },
  },
} satisfies Prisma.UserDefaultArgs;

type UserWithRole = Prisma.UserGetPayload<typeof userWithRole>;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) { }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

    if (!token) {
      throw new AppError("TOKEN_INVALID", 401, "Authentication token is required");
    }

    let payload;
    try {
      payload = verifyToken(token, "access");
    } catch {
      throw new AppError("TOKEN_INVALID", 401, "Invalid or expired token");
    }

    // The token says which table `sub` belongs to. Customers are rows in
    // Customer, not User, so looking them up here would always miss.
    if (payload.principal === "customer") {
      const customer = await this.prisma.customer.findUnique({ where: { id: payload.sub } });

      if (!customer) {
        throw new AppError("TOKEN_INVALID", 401, "Invalid or expired token");
      }

      if (!customer.isActive) {
        throw new AppError("ACCOUNT_INACTIVE", 403, "User account is inactive");
      }

      request.user = await this.toAuthenticatedCustomer(customer);
      return true;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      ...userWithRole,
    });

    if (!user) {
      throw new AppError("TOKEN_INVALID", 401, "Invalid or expired token");
    }

    if (!user.isActive) {
      throw new AppError("ACCOUNT_INACTIVE", 403, "User account is inactive");
    }

    request.user = this.toAuthenticatedUser(user);
    return true;
  }

  private async toAuthenticatedCustomer(customer: Customer): Promise<AuthenticatedUser> {
    const customerRole = await this.prisma.role.findUnique({
      where: { name: "customer" },
      include: { permissions: true },
    });

    return {
      id: customer.id,
      name: customer.name,
      email: customer.email ?? "",
      roleId: customerRole?.id ?? customer.id,
      roleName: "customer",
      branchId: null,
      lang: "ar" as Language,
      permissions: (customerRole?.permissions ?? []).map((permission) => ({
        resource: permission.resource as Resource,
        action: permission.action as Action,
      })),
      isSuperAdmin: false,
      isCustomer: true,
      customerId: customer.id,
    };
  }

  private toAuthenticatedUser(user: UserWithRole): AuthenticatedUser {
    const isSuperAdmin = user.role.name === 'super_admin';
    const isCustomer = user.role.name === 'customer';
    
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branch: user.branch,
      roleId: user.roleId,
      roleName: user.role.name,
      branchId: user.branchId,
      lang: user.lang as Language,
      permissions: user.role.permissions.map((permission) => ({
        resource: permission.resource as Resource,
        action: permission.action as Action,
      })),
      isSuperAdmin,
      isCustomer,
      customerId: isCustomer ? user.id : undefined,
    };
  }
}
