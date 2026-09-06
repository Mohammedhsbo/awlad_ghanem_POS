import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../upload/storage.service.js";
import type { AuthenticatedUser } from "../common/types/authenticated-request.js";

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async list(branchId?: string) {
    return this.prisma.sale.findMany({
      where: branchId ? { branchId } : undefined,
      include: {
        motorcycle: { include: { brand: true } },
        user: true,
        branch: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(id: string) {
    return this.prisma.sale.findUnique({
      where: { id },
      include: {
        motorcycle: { include: { brand: true } },
        user: true,
        branch: true,
      },
    });
  }

  async create(
    user: AuthenticatedUser,
    input: {
      motorcycleId: string;
      customerName: string;
      customerPhone: string;
      salePrice: number;
      paymentMethod: "CASH" | "VISA";
    },
    idImageFile?: Express.Multer.File
  ) {
    let customerIdImage: string | undefined;
    if (idImageFile) {
      const result = await this.storage.uploadFile(idImageFile, "sales/id-images");
      customerIdImage = result.url;
    }

    const motorcycle = await this.prisma.motorcycle.findUnique({
      where: { id: input.motorcycleId },
      include: { brand: true },
    });
    if (!motorcycle) throw new Error('Motorcycle not found');
    if (!user.branchId || motorcycle.branchId !== user.branchId) throw new Error('Motorcycle not in your branch');

    const customer = await this.prisma.customer.upsert({
      where: { phone: input.customerPhone },
      create: { name: input.customerName, phone: input.customerPhone },
      update: { name: input.customerName },
    });
    const branch = await this.prisma.branch.findUnique({ where: { id: user.branchId } });
    if (!branch) throw new Error('Branch not found');

    const order = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM "Motorcycle" WHERE id = ${input.motorcycleId}::uuid FOR UPDATE
      `;
      if (locked[0]?.status !== 'available') throw new Error('Motorcycle is not available');
      const created = await tx.desktopOrder.create({
        data: {
          orderNumber: `DORD-${branch.nameEn.substring(0, 3).toUpperCase()}-${Date.now()}`,
          customerId: customer.id,
          branchId: branch.id,
          userId: user.id,
          status: 'completed',
          paymentType: 'CASH',
          totalAmount: input.salePrice,
          discount: 0,
          netAmount: input.salePrice,
          idempotencyKey: `pos-cash-${user.id}-${input.motorcycleId}-${Date.now()}`,
          items: { create: { motorcycleId: input.motorcycleId, unitPrice: input.salePrice, discount: 0 } },
        },
        include: { customer: true, branch: true, user: true },
      });
      await tx.motorcycle.update({ where: { id: input.motorcycleId }, data: { status: 'sold' } });
      return created;
    });

    return {
      id: order.id,
      motorcycleId: input.motorcycleId,
      motorcycle: { ...motorcycle, price: Number(motorcycle.price), costPrice: Number(motorcycle.costPrice) },
      customerName: customer.name,
      customerPhone: customer.phone,
      customerIdImage,
      salePrice: input.salePrice,
      paymentMethod: input.paymentMethod,
      branchId: order.branchId,
      createdBy: order.userId,
      createdAt: order.createdAt.toISOString(),
    };
  }
}
