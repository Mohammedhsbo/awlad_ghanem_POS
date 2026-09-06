import { Inject, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { CreateSupplierRequest, UpdateSupplierRequest } from '@motorcycle-system/shared-types';

@Injectable()
export class SuppliersService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async create(data: CreateSupplierRequest) {
    try {
      return await this.prisma.supplier.create({
        data: {
          name: data.name,
          contactPerson: data.contactPerson,
          phone: data.phone,
          email: data.email,
          address: data.address,
          notes: data.notes,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'SUPPLIER_NAME_EXISTS', message: 'A supplier with this name already exists' });
      }
      throw error;
    }
  }

  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    isActive?: boolean;
  }) {
    const { page, limit, search, isActive } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: {
            select: { purchases: true }
          }
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: { purchases: true }
        }
      }
    });

    if (!supplier) {
      throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Supplier not found' });
    }

    return supplier;
  }

  async update(id: string, data: UpdateSupplierRequest) {
    // Check existence first to return correct error
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Supplier not found' });
    }

    try {
      return await this.prisma.supplier.update({
        where: { id },
        data: {
          name: data.name,
          contactPerson: data.contactPerson,
          phone: data.phone,
          email: data.email,
          address: data.address,
          notes: data.notes,
          isActive: data.isActive,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'SUPPLIER_NAME_EXISTS', message: 'A supplier with this name already exists' });
      }
      throw error;
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: { purchases: true }
        }
      }
    });

    if (!existing) {
      throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Supplier not found' });
    }

    if (existing._count.purchases > 0) {
      throw new ConflictException({ code: 'SUPPLIER_HAS_PURCHASES', message: 'Cannot delete a supplier with associated purchases' });
    }

    await this.prisma.supplier.delete({
      where: { id },
    });

    return true;
  }
}
