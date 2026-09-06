import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  Brand,
  BrandListItem,
  CreateBrandRequest,
  ListBrandsQuery,
  UpdateBrandRequest,
} from "@motorcycle-system/shared-types";
import { AuditService } from "../audit/audit.service.js";
import { AppError } from "../common/errors/app-error.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { PrismaService } from "../prisma/prisma.service.js";

const brandListInclude = {
  include: {
    _count: {
      select: {
        motorcycles: true,
      },
    },
  },
} satisfies Prisma.BrandDefaultArgs;

type BrandListRecord = Prisma.BrandGetPayload<typeof brandListInclude>;

@Injectable()
export class BrandsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async create(input: CreateBrandRequest, actor: AuthenticatedUser): Promise<Brand> {
    await this.assertBrandNameAvailable(input.nameAr, input.nameEn);

    const brand = await this.prisma.brand.create({
      data: {
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        logo: input.logo || null,
        sortOrder: input.sortOrder ?? 0,
      },
    });

    await this.audit.log({
      userId: actor.id,
      action: "brand.create",
      entityType: "brand",
      entityId: brand.id,
      branchId: actor.branchId,
      after: this.auditBrand(brand),
    });

    return this.toBrandResponse(brand);
  }

  async list(query: ListBrandsQuery, actor: AuthenticatedUser | null) {
    const where: Prisma.BrandWhereInput = {};

    // For public access (no authentication), default to active brands only
    // For authenticated staff, show all brands if no filter specified
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    } else if (!actor) {
      // Public access - only show active brands
      where.isActive = true;
    }

    const brands = await this.prisma.brand.findMany({
      where,
      ...brandListInclude,
      orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    });

    return brands.map((brand) => this.toBrandListItem(brand, actor));
  }

  async getById(id: string, actor: AuthenticatedUser | null): Promise<BrandListItem> {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      ...brandListInclude,
    });

    if (!brand) {
      throw new AppError("BRAND_NOT_FOUND", 404, "Brand not found");
    }

    return this.toBrandListItem(brand, actor);
  }

  async update(id: string, input: UpdateBrandRequest, actor: AuthenticatedUser): Promise<Brand> {
    const current = await this.prisma.brand.findUnique({
      where: { id },
    });

    if (!current) {
      throw new AppError("BRAND_NOT_FOUND", 404, "Brand not found");
    }

    // Check for name conflicts if names are being changed
    if (input.nameAr || input.nameEn) {
      const nameAr = input.nameAr ?? current.nameAr;
      const nameEn = input.nameEn ?? current.nameEn;
      
      if (nameAr !== current.nameAr || nameEn !== current.nameEn) {
        await this.assertBrandNameAvailable(nameAr, nameEn, id);
      }
    }

    const updated = await this.prisma.brand.update({
      where: { id },
      data: {
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        logo: input.logo !== undefined ? input.logo : undefined,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });

    await this.audit.log({
      userId: actor.id,
      action: "brand.update",
      entityType: "brand",
      entityId: updated.id,
      branchId: actor.branchId,
      before: this.auditBrand(current),
      after: this.auditBrand(updated),
    });

    return this.toBrandResponse(updated);
  }

  async delete(id: string, actor: AuthenticatedUser) {
    const current = await this.prisma.brand.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            motorcycles: true,
          },
        },
      },
    });

    if (!current) {
      throw new AppError("BRAND_NOT_FOUND", 404, "Brand not found");
    }

    if (current._count.motorcycles > 0) {
      throw new AppError("BRAND_IN_USE", 409, "Brand has associated motorcycles");
    }

    await this.prisma.brand.delete({ where: { id } });

    await this.audit.log({
      userId: actor.id,
      action: "brand.delete",
      entityType: "brand",
      entityId: id,
      branchId: actor.branchId,
      before: this.auditBrand(current),
    });
  }

  private async assertBrandNameAvailable(nameAr: string, nameEn: string, excludeBrandId?: string) {
    const existing = await this.prisma.brand.findFirst({
      where: {
        OR: [
          { nameAr: { equals: nameAr, mode: "insensitive" } },
          { nameEn: { equals: nameEn, mode: "insensitive" } },
        ],
        id: excludeBrandId ? { not: excludeBrandId } : undefined,
      },
    });

    if (existing) {
      const conflictField = existing.nameAr.toLowerCase() === nameAr.toLowerCase() ? "Arabic" : "English";
      throw new AppError("BRAND_NAME_EXISTS", 409, `Brand name already exists (${conflictField})`);
    }
  }

  private toBrandResponse(brand: {
    id: string;
    nameAr: string;
    nameEn: string;
    logo: string | null;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }): Brand {
    return {
      id: brand.id,
      nameAr: brand.nameAr,
      nameEn: brand.nameEn,
      logo: brand.logo,
      isActive: brand.isActive,
      sortOrder: brand.sortOrder,
      createdAt: brand.createdAt.toISOString(),
      updatedAt: brand.updatedAt.toISOString(),
    };
  }

  private toBrandListItem(brand: BrandListRecord, actor: AuthenticatedUser | null): BrandListItem {
    const result: BrandListItem = {
      id: brand.id,
      nameAr: brand.nameAr,
      nameEn: brand.nameEn,
      logo: brand.logo,
      isActive: brand.isActive,
      sortOrder: brand.sortOrder,
      createdAt: brand.createdAt.toISOString(),
      updatedAt: brand.updatedAt.toISOString(),
    };

    // Only include motorcycle count for authenticated staff
    if (actor) {
      result._count = {
        motorcycles: brand._count.motorcycles,
      };
    }

    return result;
  }

  private auditBrand(brand: {
    id: string;
    nameAr: string;
    nameEn: string;
    logo: string | null;
    isActive: boolean;
    sortOrder: number;
  }): Prisma.InputJsonObject {
    return {
      id: brand.id,
      nameAr: brand.nameAr,
      nameEn: brand.nameEn,
      logo: brand.logo,
      isActive: brand.isActive,
      sortOrder: brand.sortOrder,
    };
  }
}