import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  Category,
  CategoryFlatItem,
  CategoryTreeItem,
  CategoryWithRelations,
  CreateCategoryRequest,
  ListCategoriesQuery,
  UpdateCategoryRequest,
} from "@motorcycle-system/shared-types";
import { AuditService } from "../audit/audit.service.js";
import { AppError } from "../common/errors/app-error.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";
import { PrismaService } from "../prisma/prisma.service.js";

const categoryListInclude = {
  include: {
    parent: {
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
      },
    },
    children: {
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] as const,
    },
    _count: {
      select: {
        motorcycles: true,
      },
    },
  },
} satisfies Prisma.CategoryDefaultArgs;

type CategoryListRecord = Prisma.CategoryGetPayload<typeof categoryListInclude>;

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async create(input: CreateCategoryRequest, actor: AuthenticatedUser): Promise<Category> {
    await this.assertCategoryNameAvailable(input.nameAr, input.nameEn, input.parentId);
    
    if (input.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: input.parentId },
      });
      if (!parent) {
        throw new AppError("PARENT_CATEGORY_NOT_FOUND", 404, "Parent category not found");
      }
    }

    const category = await this.prisma.category.create({
      data: {
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        parentId: input.parentId || null,
        sortOrder: input.sortOrder ?? 0,
      },
    });

    await this.audit.log({
      userId: actor.id,
      action: "category.create",
      entityType: "category",
      entityId: category.id,
      branchId: actor.branchId,
      after: this.auditCategory(category),
    });

    return this.toCategoryResponse(category);
  }

  async list(query: ListCategoriesQuery, actor: AuthenticatedUser | null) {
    const where: Prisma.CategoryWhereInput = {};

    // For public access, default to active categories only
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    } else if (!actor) {
      where.isActive = true;
    }

    const categories = await this.prisma.category.findMany({
      where,
      ...categoryListInclude,
      orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    });

    if (query.flat) {
      return this.buildFlatList(categories, actor);
    } else {
      return this.buildTreeStructure(categories, actor);
    }
  }

  async getById(id: string, actor: AuthenticatedUser | null): Promise<CategoryWithRelations> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      ...categoryListInclude,
    });

    if (!category) {
      throw new AppError("CATEGORY_NOT_FOUND", 404, "Category not found");
    }

    return this.toCategoryWithRelations(category, actor);
  }

  async update(id: string, input: UpdateCategoryRequest, actor: AuthenticatedUser): Promise<Category> {
    const current = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!current) {
      throw new AppError("CATEGORY_NOT_FOUND", 404, "Category not found");
    }

    // Check for circular reference if parentId is being changed
    if (input.parentId !== undefined) {
      if (input.parentId === id) {
        throw new AppError("CIRCULAR_REFERENCE", 422, "Category cannot be its own parent");
      }
      
      if (input.parentId && input.parentId !== current.parentId) {
        await this.assertNoCircularReference(id, input.parentId);
        
        // Verify parent exists
        const parent = await this.prisma.category.findUnique({
          where: { id: input.parentId },
        });
        if (!parent) {
          throw new AppError("PARENT_CATEGORY_NOT_FOUND", 404, "Parent category not found");
        }
      }
    }

    // Check for name conflicts if names are being changed
    if (input.nameAr || input.nameEn) {
      const nameAr = input.nameAr ?? current.nameAr;
      const nameEn = input.nameEn ?? current.nameEn;
      const parentId = input.parentId !== undefined ? input.parentId : current.parentId;
      
      if (nameAr !== current.nameAr || nameEn !== current.nameEn || parentId !== current.parentId) {
        await this.assertCategoryNameAvailable(nameAr, nameEn, parentId, id);
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        parentId: input.parentId !== undefined ? input.parentId : undefined,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });

    await this.audit.log({
      userId: actor.id,
      action: "category.update",
      entityType: "category",
      entityId: updated.id,
      branchId: actor.branchId,
      before: this.auditCategory(current),
      after: this.auditCategory(updated),
    });

    return this.toCategoryResponse(updated);
  }

  async delete(id: string, actor: AuthenticatedUser) {
    const current = await this.prisma.category.findUnique({
      where: { id },
      include: {
        children: true,
        _count: {
          select: {
            motorcycles: true,
          },
        },
      },
    });

    if (!current) {
      throw new AppError("CATEGORY_NOT_FOUND", 404, "Category not found");
    }

    if (current._count.motorcycles > 0) {
      throw new AppError("CATEGORY_IN_USE", 409, "Category has associated motorcycles");
    }

    if (current.children.length > 0) {
      throw new AppError("CATEGORY_HAS_CHILDREN", 409, "Category has child categories");
    }

    await this.prisma.category.delete({ where: { id } });

    await this.audit.log({
      userId: actor.id,
      action: "category.delete",
      entityType: "category",
      entityId: id,
      branchId: actor.branchId,
      before: this.auditCategory(current),
    });
  }

  private async assertCategoryNameAvailable(
    nameAr: string, 
    nameEn: string, 
    parentId: string | null | undefined, 
    excludeCategoryId?: string
  ) {
    const existing = await this.prisma.category.findFirst({
      where: {
        OR: [
          { nameAr: { equals: nameAr, mode: "insensitive" } },
          { nameEn: { equals: nameEn, mode: "insensitive" } },
        ],
        parentId: parentId || null,
        id: excludeCategoryId ? { not: excludeCategoryId } : undefined,
      },
    });

    if (existing) {
      const conflictField = existing.nameAr.toLowerCase() === nameAr.toLowerCase() ? "Arabic" : "English";
      throw new AppError("CATEGORY_NAME_EXISTS", 409, `Category name already exists at this level (${conflictField})`);
    }
  }

  private async assertNoCircularReference(categoryId: string, newParentId: string) {
    // Check if newParentId is a descendant of categoryId
    const isDescendant = await this.isDescendantOf(newParentId, categoryId);
    if (isDescendant) {
      throw new AppError("CIRCULAR_REFERENCE", 422, "Circular reference detected: parent cannot be a descendant");
    }
  }

  private async isDescendantOf(potentialDescendant: string, ancestor: string): Promise<boolean> {
    const category = await this.prisma.category.findUnique({
      where: { id: potentialDescendant },
      select: { parentId: true },
    });

    if (!category || !category.parentId) {
      return false;
    }

    if (category.parentId === ancestor) {
      return true;
    }

    return this.isDescendantOf(category.parentId, ancestor);
  }

  private buildTreeStructure(categories: CategoryListRecord[], actor: AuthenticatedUser | null): CategoryTreeItem[] {
    const categoryMap = new Map<string, CategoryTreeItem>();
    const rootCategories: CategoryTreeItem[] = [];

    // First pass: create all category items
    for (const category of categories) {
      const categoryItem = this.toCategoryTreeItem(category, actor);
      categoryItem.children = [];
      categoryMap.set(category.id, categoryItem);
    }

    // Second pass: build the hierarchy
    for (const category of categories) {
      const categoryItem = categoryMap.get(category.id)!;
      
      if (category.parentId) {
        const parent = categoryMap.get(category.parentId);
        if (parent) {
          parent.children!.push(categoryItem);
        }
      } else {
        rootCategories.push(categoryItem);
      }
    }

    // Sort children at each level
    this.sortTreeChildren(rootCategories);
    return rootCategories;
  }

  private sortTreeChildren(categories: CategoryTreeItem[]) {
    categories.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.nameEn.localeCompare(b.nameEn);
    });

    for (const category of categories) {
      if (category.children && category.children.length > 0) {
        this.sortTreeChildren(category.children);
      }
    }
  }

  private buildFlatList(categories: CategoryListRecord[], actor: AuthenticatedUser | null): CategoryFlatItem[] {
    const categoryMap = new Map<string, CategoryListRecord>();
    const pathCache = new Map<string, string>();

    for (const category of categories) {
      categoryMap.set(category.id, category);
    }

    const result: CategoryFlatItem[] = [];

    for (const category of categories) {
      const depth = this.calculateDepth(category.id, categoryMap, new Set());
      const path = this.buildPath(category.id, categoryMap, pathCache);
      
      result.push({
        ...this.toCategoryResponse(category),
        depth,
        path,
        _count: actor ? { motorcycles: category._count.motorcycles } : undefined,
      });
    }

    // Sort by path for hierarchical order
    result.sort((a, b) => a.path.localeCompare(b.path));
    return result;
  }

  private calculateDepth(categoryId: string, categoryMap: Map<string, CategoryListRecord>, visited: Set<string>): number {
    if (visited.has(categoryId)) {
      return 0; // Prevent infinite recursion in case of data inconsistency
    }
    
    visited.add(categoryId);
    const category = categoryMap.get(categoryId);
    
    if (!category || !category.parentId) {
      return 0;
    }

    return 1 + this.calculateDepth(category.parentId, categoryMap, visited);
  }

  private buildPath(categoryId: string, categoryMap: Map<string, CategoryListRecord>, pathCache: Map<string, string>): string {
    if (pathCache.has(categoryId)) {
      return pathCache.get(categoryId)!;
    }

    const category = categoryMap.get(categoryId);
    if (!category) {
      return "";
    }

    let path = category.nameEn;
    if (category.parentId) {
      const parentPath = this.buildPath(category.parentId, categoryMap, pathCache);
      if (parentPath) {
        path = `${parentPath} > ${category.nameEn}`;
      }
    }

    pathCache.set(categoryId, path);
    return path;
  }

  private toCategoryResponse(category: {
    id: string;
    nameAr: string;
    nameEn: string;
    parentId: string | null;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }): Category {
    return {
      id: category.id,
      nameAr: category.nameAr,
      nameEn: category.nameEn,
      parentId: category.parentId,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  private toCategoryTreeItem(category: CategoryListRecord, actor: AuthenticatedUser | null): CategoryTreeItem {
    const result: CategoryTreeItem = {
      ...this.toCategoryResponse(category),
    };

    // Only include motorcycle count for authenticated users
    if (actor) {
      result._count = {
        motorcycles: category._count.motorcycles,
      };
    }

    return result;
  }

  private toCategoryWithRelations(category: CategoryListRecord, actor: AuthenticatedUser | null): CategoryWithRelations {
    return {
      ...this.toCategoryResponse(category),
      parent: category.parent,
      children: category.children,
      _count: {
        motorcycles: category._count.motorcycles,
      },
    };
  }

  private auditCategory(category: {
    id: string;
    nameAr: string;
    nameEn: string;
    parentId: string | null;
    isActive: boolean;
    sortOrder: number;
  }): Prisma.InputJsonObject {
    return {
      id: category.id,
      nameAr: category.nameAr,
      nameEn: category.nameEn,
      parentId: category.parentId,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
    };
  }
}