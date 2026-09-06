import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Prisma } from '@prisma/client';
import { SocketGateway } from '../socket/index.js';
import { 
  CreateMotorcycleRequest, 
  UpdateMotorcycleRequest,
  ListMotorcyclesQuery
} from '@motorcycle-system/shared-types';

type MonetaryRow = { price?: unknown; costPrice?: unknown };

/**
 * Prisma hands back `Decimal` for money columns and `JSON.stringify` turns those
 * into strings, but the published `Motorcycle` contract declares them numbers.
 */
function serializeMoney<T extends MonetaryRow>(row: T): T {
  if (row.price !== undefined && row.price !== null) {
    (row as MonetaryRow).price = Number(row.price);
  }
  if (row.costPrice !== undefined && row.costPrice !== null) {
    (row as MonetaryRow).costPrice = Number(row.costPrice);
  }
  return row;
}

@Injectable()
export class MotorcyclesService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(AuditService) private audit: AuditService,
    @Inject(SocketGateway) private socketGateway: SocketGateway,
  ) {}

  async create(data: CreateMotorcycleRequest, userId: string, userBranchId: string | null, userIsSuperAdmin: boolean) {
    // Branch scoping
    if (!userIsSuperAdmin && userBranchId && data.branchId !== userBranchId) {
      throw new ForbiddenException('Cannot create motorcycle in a different branch');
    }

    // Check VIN uniqueness
    const existingVin = await this.prisma.motorcycle.findUnique({
      where: { vin: data.vin }
    });
    if (existingVin) {
      throw new ConflictException({ code: 'VIN_EXISTS', message: 'VIN already exists' });
    }

    // Verify relations exist
    await this.verifyRelations(data.brandId, data.categoryId, data.branchId);

    let motorcycle;
    try {
      motorcycle = await this.prisma.motorcycle.create({
        data: {
          vin: data.vin,
          engineNumber: data.engineNumber,
          model: data.model,
          year: data.year,
          color: data.color,
          engineSize: data.engineSize,
          descriptionAr: data.descriptionAr,
          descriptionEn: data.descriptionEn,
          price: data.price,
          costPrice: data.costPrice,
          brandId: data.brandId,
          categoryId: data.categoryId,
          branchId: data.branchId,
          images: data.images ?? [],
          status: data.status ?? 'available',
        },
        include: {
          brand: true,
          category: true,
          branch: true
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target ?? '').toLowerCase();
        if (target.includes('vin')) {
          throw new ConflictException({ code: 'VIN_EXISTS', message: 'VIN already exists' });
        }
        if (target.includes('enginenumber')) {
          throw new ConflictException({ code: 'ENGINE_NUMBER_EXISTS', message: 'Engine number already exists' });
        }
      }
      throw error;
    }

    await this.audit.log({
      userId,
      action: 'motorcycle:create',
      entityType: 'motorcycle',
      entityId: motorcycle.id,
      after: motorcycle as any,
      branchId: motorcycle.branchId
    });
    
    this.socketGateway.emitMotorcycleCreated({
      motorcycleId: motorcycle.id,
      branchId: motorcycle.branchId,
      status: motorcycle.status,
    });

    return serializeMoney(motorcycle);
  }

  async findAll(query: ListMotorcyclesQuery, userBranchId: string | null, userIsSuperAdmin: boolean, isCustomer: boolean = false) {
    const { page, limit, search, brandId, categoryId, branchId, status, minPrice, maxPrice, minYear, maxYear, color, sort, order } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Branch scoping
    if (!userIsSuperAdmin && userBranchId) {
      where.branchId = userBranchId;
    } else if (branchId) {
      where.branchId = branchId;
    }

    // Customers can only see available motorcycles
    if (isCustomer) {
      where.status = 'available';
    } else if (status) {
      where.status = status;
    }

    if (brandId) where.brandId = brandId;
    if (categoryId) where.categoryId = categoryId;
    if (color) where.color = color;

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    if (minYear !== undefined || maxYear !== undefined) {
      where.year = {};
      if (minYear !== undefined) where.year.gte = minYear;
      if (maxYear !== undefined) where.year.lte = maxYear;
    }

    if (search) {
      where.OR = [
        { model: { contains: search, mode: 'insensitive' } },
        { vin: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.motorcycle.findMany({
        where,
        include: {
          brand: true,
          category: true,
          branch: true
        },
        skip,
        take: limit,
        orderBy: {
          [sort]: order
        }
      }),
      this.prisma.motorcycle.count({ where })
    ]);

    items.forEach((item) => serializeMoney(item));

    // Omit costPrice for customers (handled in controller or here)
    if (isCustomer) {
      items.forEach(item => {
        delete (item as any).costPrice;
      });
    }

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async findOne(id: string, userBranchId: string | null, userIsSuperAdmin: boolean, isCustomer: boolean = false) {
    const motorcycle = await this.prisma.motorcycle.findUnique({
      where: { id },
      include: {
        brand: true,
        category: true,
        branch: true
      }
    });

    if (!motorcycle) {
      throw new NotFoundException({ code: 'MOTORCYCLE_NOT_FOUND', message: 'Motorcycle not found' });
    }

    if (!userIsSuperAdmin && userBranchId && motorcycle.branchId !== userBranchId) {
      throw new ForbiddenException('Cannot access motorcycle from a different branch');
    }

    if (isCustomer && motorcycle.status !== 'available') {
      throw new NotFoundException({ code: 'MOTORCYCLE_NOT_FOUND', message: 'Motorcycle not found' });
    }

    if (isCustomer) {
      delete (motorcycle as any).costPrice;
    }

    return serializeMoney(motorcycle);
  }

  async update(id: string, data: UpdateMotorcycleRequest, userId: string, userBranchId: string | null, userIsSuperAdmin: boolean) {
    const existing = await this.findOne(id, userBranchId, userIsSuperAdmin); // Re-uses finding and auth checks

    if (data.brandId || data.categoryId) {
      await this.verifyRelations(data.brandId || existing.brandId, data.categoryId || existing.categoryId, existing.branchId);
    }

    let updated;
    try {
      updated = await this.prisma.motorcycle.update({
        where: { id },
        data: {
          vin: data.vin,
          model: data.model,
          year: data.year,
          color: data.color,
          engineNumber: data.engineNumber,
          engineSize: data.engineSize,
          descriptionAr: data.descriptionAr,
          descriptionEn: data.descriptionEn,
          price: data.price,
          costPrice: data.costPrice,
          brandId: data.brandId,
          categoryId: data.categoryId,
          images: data.images,
        },
        include: {
          brand: true,
          category: true,
          branch: true
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target ?? '').toLowerCase();
        if (target.includes('vin')) {
          throw new ConflictException({ code: 'VIN_EXISTS', message: 'VIN already exists' });
        }
        if (target.includes('enginenumber')) {
          throw new ConflictException({ code: 'ENGINE_NUMBER_EXISTS', message: 'Engine number already exists' });
        }
      }
      throw error;
    }

    await this.audit.log({
      userId,
      action: 'motorcycle:update',
      entityType: 'motorcycle',
      entityId: updated.id,
      before: existing as any,
      after: updated as any,
      branchId: updated.branchId
    });
    return serializeMoney(updated);
  }

  async updateStatus(
    id: string,
    newStatus: string,
    reason: string | undefined,
    userId: string,
    userBranchId: string | null,
    userIsSuperAdmin: boolean
  ) {
    return await this.prisma.$transaction(async (tx) => {
      // Lock the row
      const motorcycles = await tx.$queryRaw<any[]>`SELECT * FROM "Motorcycle" WHERE id = ${id}::uuid FOR UPDATE`;
      const motorcycle = motorcycles[0];

      if (!motorcycle) {
        throw new NotFoundException({ code: 'MOTORCYCLE_NOT_FOUND', message: 'Motorcycle not found' });
      }

      if (!userIsSuperAdmin && userBranchId && motorcycle.branchId !== userBranchId) {
        throw new ForbiddenException('Cannot update motorcycle status from a different branch');
      }

      const currentStatus = motorcycle.status;
      
      const validTransitions: Record<string, string[]> = {
        in_transit: ['available'],
        available: ['reserved', 'sold', 'in_transfer', 'maintenance'],
        reserved: ['available', 'sold'],
        in_transfer: ['available'],
        maintenance: ['available'],
        sold: ['returned'],
        returned: ['available']
      };

      if (!validTransitions[currentStatus]?.includes(newStatus)) {
        throw new ConflictException({ code: 'INVALID_TRANSITION', message: `Cannot transition from ${currentStatus} to ${newStatus}` });
      }

      const updated = await tx.motorcycle.update({
        where: { id },
        data: { status: newStatus as any }
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'motorcycle:status_change',
          entityType: 'motorcycle',
          entityId: id,
          branchId: updated.branchId,
          before: { status: currentStatus },
          after: { status: newStatus, reason }
        }
      });

      this.socketGateway.emitMotorcycleStatusChanged({
        motorcycleId: id,
        oldStatus: currentStatus,
        newStatus: newStatus,
        branchId: updated.branchId,
      });

      return {
        id: updated.id,
        vin: updated.vin,
        model: updated.model,
        status: updated.status,
        previousStatus: currentStatus,
        updatedAt: updated.updatedAt.toISOString()
      };
    });
  }

  async remove(id: string, userId: string, userBranchId: string | null, userIsSuperAdmin: boolean) {
    const existing = await this.findOne(id, userBranchId, userIsSuperAdmin);

    if (existing.status === 'sold' || existing.status === 'reserved') {
      throw new ConflictException({ code: 'INVALID_STATUS', message: 'Cannot delete a sold or reserved motorcycle' });
    }

    // Check if it has any orders associated, if orderItem exists in Prisma
    if ('orderItem' in this.prisma) {
      const ordersCount = await (this.prisma as any).orderItem.count({
        where: { motorcycleId: id }
      });

      if (ordersCount > 0) {
        throw new ConflictException({ code: 'MOTORCYCLE_HAS_ORDERS', message: 'Motorcycle has associated orders' });
      }
    }

    const reservationsCount = await this.prisma.reservation.count({
      where: { motorcycleId: id }
    });

    if (reservationsCount > 0) {
      throw new ConflictException({ code: 'MOTORCYCLE_HAS_RESERVATIONS', message: 'Cannot delete a motorcycle with reservation history' });
    }

    await this.prisma.motorcycle.delete({ where: { id } });
    await this.audit.log({
      userId,
      action: 'motorcycle:delete',
      entityType: 'motorcycle',
      entityId: existing.id,
      before: existing as any,
      branchId: existing.branchId
    });
    
    this.socketGateway.emitMotorcycleDeleted({
      motorcycleId: existing.id,
      branchId: existing.branchId,
    });

    // In a real app we'd trigger image deletion here using StorageService
    return true;
  }

  private async verifyRelations(brandId: string, categoryId: string, branchId: string) {
    const [brand, category, branch] = await Promise.all([
      this.prisma.brand.findUnique({ where: { id: brandId } }),
      this.prisma.category.findUnique({ where: { id: categoryId } }),
      this.prisma.branch.findUnique({ where: { id: branchId } })
    ]);

    if (!brand) throw new NotFoundException({ code: 'BRAND_NOT_FOUND', message: 'Brand not found' });
    if (!category) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found' });
    if (!branch) throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Branch not found' });
  }
}
