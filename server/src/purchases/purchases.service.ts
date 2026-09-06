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
import { CreatePurchaseRequest, UpdatePurchaseRequest, ReceivePurchaseRequest } from '@motorcycle-system/shared-types';
import { generatePurchaseNumber, withUniqueRetry } from '../utils/number-generator.js';
import { SocketGateway } from '../socket/index.js';

async function createMotorcycleForVin<T>(vin: string, create: () => Promise<T>): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      String(error.meta?.target ?? '').includes('vin')
    ) {
      throw new ConflictException({ code: 'VIN_EXISTS', message: `VIN ${vin} already exists` });
    }
    throw error;
  }
}

@Injectable()
export class PurchasesService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(AuditService) private audit: AuditService,
    @Inject(SocketGateway) private socketGateway: SocketGateway,
  ) { }

  async create(data: CreatePurchaseRequest, userId: string, userBranchId: string | null, isSuperAdmin: boolean) {
    const branchId = data.branchId ?? userBranchId;
    if (!branchId) {
      throw new BadRequestException({ code: 'BRANCH_REQUIRED', message: 'Branch ID is required' });
    }
    if (!isSuperAdmin && branchId !== userBranchId) {
      throw new ForbiddenException({ code: 'BRANCH_SCOPE_VIOLATION', message: 'You can only create purchases for your own branch' });
    }

    const [supplier, branch] = await Promise.all([
      this.prisma.supplier.findUnique({ where: { id: data.supplierId } }),
      this.prisma.branch.findUnique({ where: { id: branchId } }),
    ]);

    if (!supplier) throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Supplier not found' });
    if (!supplier.isActive) throw new ConflictException({ code: 'SUPPLIER_INACTIVE', message: 'Supplier is inactive' });
    if (!branch) throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Branch not found' });

    const totalAmount = data.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);

    return withUniqueRetry(async () => {
      const branchCode = branch.nameEn.substring(0, 3).toUpperCase();
      const purchaseNumber = await generatePurchaseNumber(this.prisma, branchCode);

      return this.prisma.$transaction(async (tx) => {
        const created = await tx.purchase.create({
          data: {
            purchaseNumber,
            supplierId: data.supplierId,
            branchId,
            userId,
            totalAmount,
            status: 'draft',
            notes: data.notes,
            items: {
              create: data.items.map(item => ({
                model: item.model,
                vin: item.vin ?? null,
                quantity: item.quantity,
                unitCost: item.unitCost,
              }))
            }
          },
          include: {
            supplier: { select: { id: true, name: true } },
            branch: { select: { id: true, nameAr: true, nameEn: true } },
            user: { select: { id: true, name: true } },
            items: true
          }
        });

        await this.audit.log({
          userId,
          action: 'CREATE',
          entityType: 'purchase',
          entityId: created.id,
          branchId,
          after: created as any,
        });

        return created;
      });
    });
  }

  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    supplierId?: string;
    branchId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    userBranchId: string | null;
    isSuperAdmin: boolean;
  }) {
    const { page, limit, search, supplierId, branchId, status, startDate, endDate, userBranchId, isSuperAdmin } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseWhereInput = {};

    if (!isSuperAdmin) {
      if (branchId && branchId !== userBranchId) {
        return { items: [], meta: { total: 0, page, limit, totalPages: 0 } };
      }
      where.branchId = userBranchId ?? undefined;
    } else if (branchId) {
      where.branchId = branchId;
    }

    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status as any;

    if (search) {
      where.OR = [
        { purchaseNumber: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [rawItems, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        include: {
          supplier: { select: { id: true, name: true } },
          branch: { select: { id: true, nameAr: true, nameEn: true } },
          items: { select: { id: true, model: true, vin: true, quantity: true, unitCost: true, motorcycleId: true } },
          _count: { select: { items: true } }
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchase.count({ where }),
    ]);

    const items = rawItems.map(item => ({
      ...item,
      itemCount: item._count.items,
      receivedCount: item.items.filter((purchaseItem) => purchaseItem.motorcycleId !== null).length,
    }));

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

  async findOne(id: string, userBranchId: string | null, isSuperAdmin: boolean) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, contactPerson: true, phone: true } },
        branch: { select: { id: true, nameAr: true, nameEn: true } },
        user: { select: { id: true, name: true } },
        items: {
          include: { motorcycle: { select: { id: true, status: true } } }
        }
      }
    });

    if (!purchase) {
      throw new NotFoundException({ code: 'PURCHASE_NOT_FOUND', message: 'Purchase not found' });
    }
    if (!isSuperAdmin && purchase.branchId !== userBranchId) {
      throw new ForbiddenException({ code: 'BRANCH_SCOPE_VIOLATION', message: 'Cannot access purchase from another branch' });
    }

    return purchase;
  }

  async update(id: string, data: UpdatePurchaseRequest, userId: string, userBranchId: string | null, isSuperAdmin: boolean) {
    const purchase = await this.findOne(id, userBranchId, isSuperAdmin);

    if (purchase.status !== 'draft') {
      throw new ConflictException({ code: 'PURCHASE_NOT_DRAFT', message: 'Cannot edit non-draft purchase' });
    }

    if (data.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: data.supplierId } });
      if (!supplier) throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Supplier not found' });
      if (!supplier.isActive) throw new ConflictException({ code: 'SUPPLIER_INACTIVE', message: 'Supplier is inactive' });
    }

    return this.prisma.$transaction(async (tx) => {
      let totalAmount: any = purchase.totalAmount;

      if (data.items) {
        await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
        await tx.purchaseItem.createMany({
          data: data.items.map(item => ({
            purchaseId: id,
            model: item.model,
            vin: item.vin ?? null,
            quantity: item.quantity,
            unitCost: item.unitCost,
          }))
        });
        totalAmount = data.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
      }

      const updated = await tx.purchase.update({
        where: { id },
        data: { supplierId: data.supplierId, notes: data.notes, totalAmount },
        include: { items: true }
      });

      await this.audit.log({
        userId,
        action: 'UPDATE',
        entityType: 'purchase',
        entityId: id,
        branchId: updated.branchId,
        before: purchase as any,
        after: updated as any,
      });

      return updated;
    });
  }

  async order(id: string, userId: string, userBranchId: string | null, isSuperAdmin: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: { items: true }
      });

      if (!purchase) throw new NotFoundException({ code: 'PURCHASE_NOT_FOUND', message: 'Purchase not found' });
      if (!isSuperAdmin && purchase.branchId !== userBranchId) {
        throw new ForbiddenException({ code: 'BRANCH_SCOPE_VIOLATION', message: 'Cannot access purchase from another branch' });
      }
      if (purchase.status !== 'draft') {
        throw new ConflictException({ code: 'INVALID_STATUS_TRANSITION', message: 'Only draft purchases can be ordered' });
      }
      if (purchase.items.length === 0) {
        throw new BadRequestException({ code: 'PURCHASE_HAS_NO_ITEMS', message: 'Cannot order a purchase with no items' });
      }

      const updated = await tx.purchase.update({
        where: { id },
        data: { status: 'ordered' }
      });

      await this.audit.log({
        userId,
        action: 'UPDATE_STATUS',
        entityType: 'purchase',
        entityId: id,
        branchId: purchase.branchId,
        before: { status: 'draft' },
        after: { status: 'ordered' },
      });

      return updated;
    });
  }

  async cancel(id: string, userId: string, userBranchId: string | null, isSuperAdmin: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { id } });

      if (!purchase) throw new NotFoundException({ code: 'PURCHASE_NOT_FOUND', message: 'Purchase not found' });
      if (!isSuperAdmin && purchase.branchId !== userBranchId) {
        throw new ForbiddenException({ code: 'BRANCH_SCOPE_VIOLATION', message: 'Cannot access purchase from another branch' });
      }
      if (purchase.status !== 'draft') {
        throw new ConflictException({ code: 'PURCHASE_NOT_DRAFT', message: 'Only draft purchases can be cancelled' });
      }

      await tx.purchase.update({
        where: { id },
        data: { status: 'cancelled' }
      });

      await this.audit.log({
        userId,
        action: 'CANCEL',
        entityType: 'purchase',
        entityId: id,
        branchId: purchase.branchId,
        before: { status: 'draft' },
        after: { status: 'cancelled' },
      });

      return true;
    });
  }

  async receive(
    id: string,
    data: ReceivePurchaseRequest,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
  ) {
    return withUniqueRetry(() => this.prisma.$transaction(async (tx) => {
      // 1. Lock the purchase row with SELECT FOR UPDATE to prevent concurrent receives
      const lockResult = await tx.$queryRaw<{ id: string; status: string; branchId: string }[]>`
        SELECT id, status, "branchId" FROM "Purchase" WHERE id = ${id}::uuid FOR UPDATE
      `;

      if (lockResult.length === 0) {
        throw new NotFoundException({ code: 'PURCHASE_NOT_FOUND', message: 'Purchase not found' });
      }

      const purchase = lockResult[0];

      if (!isSuperAdmin && purchase.branchId !== userBranchId) {
        throw new ForbiddenException({ code: 'BRANCH_SCOPE_VIOLATION', message: 'Cannot access purchase from another branch' });
      }

      // 2. Must be ordered or partially_received
      if (purchase.status !== 'ordered' && purchase.status !== 'partially_received') {
        throw new ConflictException({ code: 'PURCHASE_NOT_ORDERED', message: 'Purchase must be in ordered or partially_received status to receive items' });
      }

      // 3. Load all items of this purchase (locked) to check for duplicates
      const allItems = await tx.$queryRaw<{
        id: string;
        purchaseId: string;
        motorcycleId: string | null;
        model: string;
        vin: string | null;
        quantity: number;
        unitCost: string;
      }[]>`
        SELECT id, "purchaseId", "motorcycleId", model, vin, quantity, "unitCost"
        FROM "PurchaseItem"
        WHERE "purchaseId" = ${id}::uuid
        FOR UPDATE
      `;

      const itemMap = new Map(allItems.map(i => [i.id, i]));
      const receivedMotorcycles: { id: string; vin: string; model: string; status: string }[] = [];

      // 4. Validate each incoming receive request
      for (const receiveItem of data.items) {
        const purchaseItem = itemMap.get(receiveItem.purchaseItemId);

        if (!purchaseItem) {
          throw new NotFoundException({ code: 'PURCHASE_ITEM_NOT_FOUND', message: `Purchase item ${receiveItem.purchaseItemId} not found` });
        }

        // Prevent duplicate receiving
        if (purchaseItem.motorcycleId !== null) {
          throw new ConflictException({ code: 'ITEM_ALREADY_RECEIVED', message: `Item ${receiveItem.purchaseItemId} has already been received` });
        }
      }

      // 5. Collect all VINs being received in this batch — check for intra-batch duplicates
      const vinSet = new Set<string>();
      for (const receiveItem of data.items) {
        const purchaseItem = itemMap.get(receiveItem.purchaseItemId)!;
        const vin = receiveItem.vin || purchaseItem.vin;
        if (!vin) {
          throw new BadRequestException({ code: 'VIN_REQUIRED', message: `VIN is required for item ${receiveItem.purchaseItemId}` });
        }
        if (vinSet.has(vin)) {
          throw new ConflictException({ code: 'VIN_EXISTS', message: `Duplicate VIN ${vin} in receive request` });
        }
        vinSet.add(vin);
      }

      // 6. Create motorcycles and link purchase items atomically
      for (const receiveItem of data.items) {
        const purchaseItem = itemMap.get(receiveItem.purchaseItemId)!;
        const vin = receiveItem.vin || purchaseItem.vin!;

        // Check global VIN uniqueness (will also throw Prisma P2002 if race condition)
        const existingVin = await tx.motorcycle.findUnique({ where: { vin } });
        if (existingVin) {
          throw new ConflictException({ code: 'VIN_EXISTS', message: `VIN ${vin} already exists` });
        }

        // Create motorcycle with in_transit status as per spec.
        // The findUnique above cannot close the window entirely, so a lost race
        // still has to come back as VIN_EXISTS rather than a raw P2002.
        const motorcycle = await createMotorcycleForVin(vin, async () => tx.motorcycle.create({
          data: {
            vin,
            model: purchaseItem.model,
            year: new Date().getFullYear(), // Year defaults to current — no year on PurchaseItem
            price: purchaseItem.unitCost,   // Selling price defaults to cost (can be updated later)
            costPrice: purchaseItem.unitCost,
            status: 'in_transit',
            branchId: purchase.branchId,
            // brandId and categoryId are not available at PO creation; they must be set post-receive
            // The spec says to copy model, vin, unitCost — brand/category are not on PurchaseItem
            // We require a placeholder approach: link to a 'unknown' brand/category
            // In production these would be provided. For now use NULL-safe defaults via raw upsert
            brandId: await this.getDefaultBrandId(tx),
            categoryId: await this.getDefaultCategoryId(tx),
          },
        }));

        // Link motorcycle to purchase item
        await tx.purchaseItem.update({
          where: { id: receiveItem.purchaseItemId },
          data: { motorcycleId: motorcycle.id },
        });

        receivedMotorcycles.push({
          id: motorcycle.id,
          vin: motorcycle.vin,
          model: motorcycle.model,
          status: motorcycle.status,
        });
      }

      // 7. Determine new purchase status
      const updatedItems = await tx.purchaseItem.findMany({
        where: { purchaseId: id },
        select: { motorcycleId: true },
      });

      const allReceived = updatedItems.every(i => i.motorcycleId !== null);
      const newStatus = allReceived ? 'received' : 'partially_received';
      const receivedAt = allReceived ? new Date() : null;

      const updatedPurchase = await tx.purchase.update({
        where: { id },
        data: {
          status: newStatus,
          ...(receivedAt ? { receivedAt } : {}),
        },
        select: {
          id: true,
          purchaseNumber: true,
          status: true,
          receivedAt: true,
        },
      });

      await this.audit.log({
        userId,
        action: 'RECEIVE',
        entityType: 'purchase',
        entityId: id,
        branchId: purchase.branchId,
        before: { status: purchase.status },
        after: { status: newStatus, receivedMotorcycles: receivedMotorcycles.map(m => m.id) },
      });

      // 8. Emit WebSocket event (fire-and-forget, non-blocking)
      try {
        this.socketGateway.server?.emit('inventory:purchase_received', {
          purchaseId: id,
          branchId: purchase.branchId,
          newStatus,
          motorcycleIds: receivedMotorcycles.map(m => m.id),
        });
      } catch { /* Non-critical */ }

      return {
        ...updatedPurchase,
        receivedMotorcycles,
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10000,
      timeout: 15000,
    }));
  }

  /**
   * Returns the ID of the first available brand as a placeholder.
   * In a real workflow, brand/category should be set when the PO item is created
   * or updated post-receive — this is a spec gap acknowledged here.
   */
  private async getDefaultBrandId(tx: Prisma.TransactionClient): Promise<string> {
    const brand = await tx.brand.findFirst({ orderBy: { sortOrder: 'asc' }, select: { id: true } });
    if (!brand) throw new BadRequestException({ code: 'NO_BRAND', message: 'No brands configured — cannot create motorcycle from purchase' });
    return brand.id;
  }

  private async getDefaultCategoryId(tx: Prisma.TransactionClient): Promise<string> {
    const category = await tx.category.findFirst({ orderBy: { sortOrder: 'asc' }, select: { id: true } });
    if (!category) throw new BadRequestException({ code: 'NO_CATEGORY', message: 'No categories configured — cannot create motorcycle from purchase' });
    return category.id;
  }

  async remove(id: string, userId: string, userBranchId: string | null, isSuperAdmin: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: { items: { where: { motorcycleId: { not: null } } } }
      });

      if (!purchase) throw new NotFoundException({ code: 'PURCHASE_NOT_FOUND', message: 'Purchase not found' });
      if (!isSuperAdmin && purchase.branchId !== userBranchId) {
        throw new ForbiddenException({ code: 'BRANCH_SCOPE_VIOLATION', message: 'Cannot access purchase from another branch' });
      }
      if (purchase.status !== 'draft') {
        throw new ConflictException({ code: 'PURCHASE_NOT_DRAFT', message: 'Only draft purchases can be deleted' });
      }
      if (purchase.items.length > 0) {
        throw new ConflictException({ code: 'PURCHASE_HAS_RECEIVED_ITEMS', message: 'Cannot delete a purchase that has received items' });
      }

      await tx.purchase.delete({ where: { id } });

      await this.audit.log({
        userId,
        action: 'DELETE',
        entityType: 'purchase',
        entityId: id,
        branchId: purchase.branchId,
      });

      return true;
    });
  }
}
