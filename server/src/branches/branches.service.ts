import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppError } from "../common/errors/app-error.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import type {
  Branch,
  CreateBranchRequest,
  ListBranchesQuery,
  UpdateBranchRequest,
} from "@motorcycle-system/shared-types";

@Injectable()
export class BranchesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async create(input: CreateBranchRequest, actor: AuthenticatedUser): Promise<Branch> {
    await this.assertNameAvailable(input.nameAr, input.nameEn);

    const branch = await this.prisma.branch.create({
      data: {
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        address: input.address ?? null,
        phone: input.phone ?? null,
        isActive: input.isActive ?? true,
      },
    });

    await this.audit.log({
      userId: actor.id,
      action: "branch.create",
      entityType: "branch",
      entityId: branch.id,
      branchId: actor.branchId,
      after: this.toAuditBranch(branch),
    });

    return this.toBranch(branch);
  }

  async list(query: ListBranchesQuery) {
    const where: Prisma.BranchWhereInput = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search) {
      where.OR = [
        { nameAr: { contains: query.search, mode: "insensitive" } },
        { nameEn: { contains: query.search, mode: "insensitive" } },
        { address: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isActive: "desc" }, { nameEn: "asc" }],
      }),
      this.prisma.branch.count({ where }),
    ]);

    return {
      items: items.map((branch) => this.toBranch(branch)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: string): Promise<Branch> {
    const branch = await this.prisma.branch.findUnique({ where: { id } });

    if (!branch) {
      throw new AppError("BRANCH_NOT_FOUND", 404, "Branch not found");
    }

    return this.toBranch(branch);
  }

  async update(id: string, input: UpdateBranchRequest, actor: AuthenticatedUser): Promise<Branch> {
    const current = await this.prisma.branch.findUnique({ where: { id } });

    if (!current) {
      throw new AppError("BRANCH_NOT_FOUND", 404, "Branch not found");
    }

    if (input.nameAr || input.nameEn) {
      const nameAr = input.nameAr ?? current.nameAr;
      const nameEn = input.nameEn ?? current.nameEn;

      if (nameAr !== current.nameAr || nameEn !== current.nameEn) {
        await this.assertNameAvailable(nameAr, nameEn, id);
      }
    }

    const updated = await this.prisma.branch.update({
      where: { id },
      data: {
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        address: input.address,
        phone: input.phone,
        isActive: input.isActive,
      },
    });

    await this.audit.log({
      userId: actor.id,
      action: "branch.update",
      entityType: "branch",
      entityId: updated.id,
      branchId: actor.branchId,
      before: this.toAuditBranch(current),
      after: this.toAuditBranch(updated),
    });

    return this.toBranch(updated);
  }

  async delete(id: string, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            motorcycles: true,
            purchases: true,
            transfersOut: true,
            transfersIn: true,
            orders: true,
            reservations: true,
            invoices: true,
            payments: true,
            financingContracts: true,
            letters: true,
            notifications: true,
            configurations: true,
            auditLogs: true,
          },
        },
      },
    });

    if (!existing) {
      throw new AppError("BRANCH_NOT_FOUND", 404, "Branch not found");
    }

    const totalRelated = Object.values(existing._count).reduce((sum, count) => sum + count, 0);
    if (totalRelated > 0) {
      throw new AppError("BRANCH_IN_USE", 409, "Branch cannot be deleted because it has associated records");
    }

    await this.prisma.branch.delete({ where: { id } });

    await this.audit.log({
      userId: actor.id,
      action: "branch.delete",
      entityType: "branch",
      entityId: id,
      branchId: actor.branchId,
      before: this.toAuditBranch(existing),
    });
  }

  private async assertNameAvailable(nameAr: string, nameEn: string, excludeId?: string) {
    const existing = await this.prisma.branch.findFirst({
      where: {
        OR: [
          { nameAr: { equals: nameAr, mode: "insensitive" } },
          { nameEn: { equals: nameEn, mode: "insensitive" } },
        ],
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    if (existing) {
      const duplicateField = existing.nameAr.toLowerCase() === nameAr.toLowerCase() ? "Arabic name" : "English name";
      throw new AppError("BRANCH_NAME_EXISTS", 409, `Branch ${duplicateField} already exists`);
    }
  }

  private toBranch(branch: {
    id: string;
    nameAr: string;
    nameEn: string;
    address: string | null;
    phone: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Branch {
    return {
      id: branch.id,
      nameAr: branch.nameAr,
      nameEn: branch.nameEn,
      address: branch.address,
      phone: branch.phone,
      isActive: branch.isActive,
      createdAt: branch.createdAt.toISOString(),
      updatedAt: branch.updatedAt.toISOString(),
    };
  }

  private toAuditBranch(branch: {
    id: string;
    nameAr: string;
    nameEn: string;
    address: string | null;
    phone: string | null;
    isActive: boolean;
  }) {
    return {
      id: branch.id,
      nameAr: branch.nameAr,
      nameEn: branch.nameEn,
      address: branch.address,
      phone: branch.phone,
      isActive: branch.isActive,
    };
  }
}
