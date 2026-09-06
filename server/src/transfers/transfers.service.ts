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
import { CreateTransferRequest } from '@motorcycle-system/shared-types';
import { generateTransferNumber, withUniqueRetry } from '../utils/number-generator.js';
import { SocketGateway } from '../socket/index.js';

@Injectable()
export class TransfersService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(AuditService) private audit: AuditService,
    @Inject(SocketGateway) private socketGateway: SocketGateway,
  ) {}

  async create(
    data: CreateTransferRequest,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
  ) {
    // 1. Resolve & scope fromBranchId
    const fromBranchId = data.fromBranchId ?? userBranchId;
    if (!fromBranchId) {
      throw new BadRequestException({ code: 'BRANCH_REQUIRED', message: 'fromBranchId is required' });
    }
    if (!isSuperAdmin && fromBranchId !== userBranchId) {
      throw new ForbiddenException({ code: 'BRANCH_SCOPE_VIOLATION', message: 'You can only initiate transfers from your own branch' });
    }

    // 2. Same-branch guard (Zod already checks this, but double-check here for safety)
    if (fromBranchId === data.toBranchId) {
      throw new BadRequestException({ code: 'SAME_BRANCH_TRANSFER', message: 'Source and destination branches must be different' });
    }

    // 3. Validate both branches exist
    const [fromBranch, toBranch] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: fromBranchId } }),
      this.prisma.branch.findUnique({ where: { id: data.toBranchId } }),
    ]);
    if (!fromBranch) throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Source branch not found' });
    if (!toBranch) throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Destination branch not found' });

    // 4. Validate motorcycles: all must exist, be available, and belong to fromBranch
    const motorcycleIds = [...new Set(data.motorcycleIds)]; // deduplicate

    const motorcycles = await this.prisma.motorcycle.findMany({
      where: { id: { in: motorcycleIds } },
      select: { id: true, vin: true, model: true, status: true, branchId: true },
    });

    const foundIds = new Set(motorcycles.map(m => m.id));
    for (const id of motorcycleIds) {
      if (!foundIds.has(id)) {
        throw new NotFoundException({ code: 'MOTORCYCLE_NOT_FOUND', message: `Motorcycle ${id} not found` });
      }
    }

    for (const motorcycle of motorcycles) {
      if (motorcycle.status !== 'available') {
        throw new ConflictException({
          code: 'MOTORCYCLE_NOT_AVAILABLE',
          message: `Motorcycle ${motorcycle.id} (VIN: ${motorcycle.vin}) is not available (status: ${motorcycle.status})`,
        });
      }
      if (motorcycle.branchId !== fromBranchId) {
        throw new ConflictException({
          code: 'MOTORCYCLE_WRONG_BRANCH',
          message: `Motorcycle ${motorcycle.id} (VIN: ${motorcycle.vin}) does not belong to the source branch`,
        });
      }
    }

    // 5. Check no motorcycle is already in an active transfer
    const activeTransferItem = await this.prisma.transferItem.findFirst({
      where: {
        motorcycleId: { in: motorcycleIds },
        transfer: { status: { in: ['initiated', 'in_transit'] } },
      },
    });
    if (activeTransferItem) {
      throw new ConflictException({
        code: 'MOTORCYCLE_IN_ACTIVE_TRANSFER',
        message: `One or more motorcycles are already in an active transfer`,
      });
    }

    // 6. Create atomically with unique-retry for transfer number
    return withUniqueRetry(async () => {
      const transferNumber = await generateTransferNumber(this.prisma);

      return this.prisma.$transaction(async (tx) => {
        const transfer = await tx.transfer.create({
          data: {
            transferNumber,
            fromBranchId,
            toBranchId: data.toBranchId,
            userId,
            status: 'initiated',
            notes: data.notes,
            items: {
              create: motorcycleIds.map(motorcycleId => ({ motorcycleId })),
            },
          },
          include: {
            fromBranch: { select: { id: true, nameAr: true, nameEn: true } },
            toBranch: { select: { id: true, nameAr: true, nameEn: true } },
            user: { select: { id: true, name: true } },
            items: {
              include: {
                motorcycle: { select: { id: true, vin: true, model: true, status: true } },
              },
            },
          },
        });

        await this.audit.log({
          userId,
          action: 'CREATE',
          entityType: 'transfer',
          entityId: transfer.id,
          branchId: fromBranchId,
          after: { transferNumber, fromBranchId, toBranchId: data.toBranchId, motorcycleIds },
        });

        return {
          id: transfer.id,
          transferNumber: transfer.transferNumber,
          fromBranch: transfer.fromBranch,
          toBranch: transfer.toBranch,
          user: transfer.user,
          status: transfer.status,
          notes: transfer.notes,
          createdAt: transfer.createdAt,
          motorcycles: transfer.items.map(item => item.motorcycle),
        };
      });
    });
  }

  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    fromBranchId?: string;
    toBranchId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    userBranchId: string | null;
    isSuperAdmin: boolean;
  }) {
    const { page, limit, search, fromBranchId, toBranchId, status, startDate, endDate, userBranchId, isSuperAdmin } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.TransferWhereInput = {};

    // Branch scoping: non-admins only see transfers involving their branch
    // Follow-up: concurrent creates can still race the active-transfer check.
    if (!isSuperAdmin && userBranchId) {
      where.OR = [
        { fromBranchId: userBranchId },
        { toBranchId: userBranchId },
      ];
      // If user also filtered by a branch, narrow further
      if (fromBranchId && fromBranchId !== userBranchId) {
        return { items: [], meta: { total: 0, page, limit, totalPages: 0 } };
      }
      if (toBranchId && toBranchId !== userBranchId) {
        return { items: [], meta: { total: 0, page, limit, totalPages: 0 } };
      }
    } else {
      if (fromBranchId) where.fromBranchId = fromBranchId;
      if (toBranchId) where.toBranchId = toBranchId;
    }

    if (status) where.status = status as any;

    if (search) {
      where.transferNumber = { contains: search, mode: 'insensitive' };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [rawItems, total] = await Promise.all([
      this.prisma.transfer.findMany({
        where,
        skip,
        take: limit,
        include: {
          fromBranch: { select: { id: true, nameAr: true, nameEn: true } },
          toBranch: { select: { id: true, nameAr: true, nameEn: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.transfer.count({ where }),
    ]);

    const items = rawItems.map(t => ({
      id: t.id,
      transferNumber: t.transferNumber,
      fromBranch: t.fromBranch,
      toBranch: t.toBranch,
      motorcycleCount: t._count.items,
      status: t.status,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
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
    // Follow-up: transfer history is represented through audit entries; no dedicated history table exists.
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: {
        fromBranch: { select: { id: true, nameAr: true, nameEn: true } },
        toBranch: { select: { id: true, nameAr: true, nameEn: true } },
        user: { select: { id: true, name: true } },
        items: {
          include: {
            motorcycle: {
              select: {
                id: true,
                vin: true,
                model: true,
                status: true,
                branchId: true,
                brand: { select: { nameAr: true, nameEn: true } },
              },
            },
          },
        },
      },
    });

    if (!transfer) {
      throw new NotFoundException({ code: 'TRANSFER_NOT_FOUND', message: 'Transfer not found' });
    }

    if (!isSuperAdmin && userBranchId) {
      if (transfer.fromBranchId !== userBranchId && transfer.toBranchId !== userBranchId) {
        throw new ForbiddenException({ code: 'BRANCH_SCOPE_VIOLATION', message: 'Cannot access this transfer' });
      }
    }

    return {
      id: transfer.id,
      transferNumber: transfer.transferNumber,
      fromBranch: transfer.fromBranch,
      toBranch: transfer.toBranch,
      user: transfer.user,
      status: transfer.status,
      notes: transfer.notes,
      createdAt: transfer.createdAt,
      completedAt: transfer.completedAt,
      updatedAt: transfer.updatedAt,
      motorcycles: transfer.items.map(item => ({
        id: item.motorcycle.id,
        vin: item.motorcycle.vin,
        model: item.motorcycle.model,
        brand: item.motorcycle.brand,
        currentStatus: item.motorcycle.status,
        currentBranchId: item.motorcycle.branchId,
      })),
    };
  }

  async ship(id: string, userId: string, userBranchId: string | null, isSuperAdmin: boolean) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the transfer
      const lockResult = await tx.$queryRaw<{ id: string; status: string; fromBranchId: string; toBranchId: string }[]>`
        SELECT id, status, "fromBranchId", "toBranchId" FROM "Transfer" WHERE id = ${id}::uuid FOR UPDATE
      `;

      if (lockResult.length === 0) {
        throw new NotFoundException({ code: 'TRANSFER_NOT_FOUND', message: 'Transfer not found' });
      }

      const transfer = lockResult[0];

      if (!isSuperAdmin && transfer.fromBranchId !== userBranchId) {
        throw new ForbiddenException({ code: 'BRANCH_SCOPE_VIOLATION', message: 'Only source branch can ship' });
      }

      if (transfer.status !== 'initiated') {
        throw new ConflictException({ code: 'INVALID_STATUS_TRANSITION', message: 'Only initiated transfers can be shipped' });
      }

      // 2. Lock and get all associated motorcycles
      const items = await tx.transferItem.findMany({ where: { transferId: id }, select: { motorcycleId: true } });
      const motorcycleIds = items.map(i => i.motorcycleId);

      if (motorcycleIds.length === 0) {
         throw new ConflictException({ code: 'TRANSFER_EMPTY', message: 'Transfer has no motorcycles' });
      }

      const lockedMotorcycles = await tx.$queryRaw<{ id: string; status: string; branchId: string; vin: string }[]>`
        SELECT id, status, "branchId", vin FROM "Motorcycle" WHERE id = ANY(ARRAY[${Prisma.join(motorcycleIds)}]::uuid[]) FOR UPDATE
      `;

      // 3. Verify they are all still available
      // Follow-up: branch ownership is not rechecked after the row lock.
      for (const m of lockedMotorcycles) {
        if (m.status !== 'available') {
           throw new ConflictException({ code: 'MOTORCYCLE_STATUS_CHANGED', message: `Motorcycle ${m.vin} is no longer available (${m.status})` });
        }
        if (m.branchId !== transfer.fromBranchId) {
          throw new ConflictException({ code: 'MOTORCYCLE_WRONG_BRANCH', message: `Motorcycle ${m.vin} no longer belongs to the source branch` });
        }
      }

      // 4. Update states
      await tx.motorcycle.updateMany({
        where: { id: { in: motorcycleIds } },
        data: { status: 'in_transfer' },
      });

      const updated = await tx.transfer.update({
        where: { id },
        data: { status: 'in_transit' },
      });

      await this.audit.log({
        userId,
        action: 'UPDATE_STATUS',
        entityType: 'transfer',
        entityId: id,
        branchId: transfer.fromBranchId,
        before: { status: 'initiated' },
        after: { status: 'in_transit' },
      });

      try {
        this.socketGateway.server?.emit('inventory:transfer_shipped', {
          transferId: id,
          fromBranchId: transfer.fromBranchId,
          toBranchId: transfer.toBranchId,
          status: 'in_transit',
        });
      } catch { /* Fire and forget */ }

      return updated;
    });
  }

  async receive(id: string, userId: string, userBranchId: string | null, isSuperAdmin: boolean) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the transfer
      const lockResult = await tx.$queryRaw<{ id: string; status: string; toBranchId: string; fromBranchId: string }[]>`
        SELECT id, status, "toBranchId", "fromBranchId" FROM "Transfer" WHERE id = ${id}::uuid FOR UPDATE
      `;

      if (lockResult.length === 0) {
        throw new NotFoundException({ code: 'TRANSFER_NOT_FOUND', message: 'Transfer not found' });
      }

      const transfer = lockResult[0];

      if (!isSuperAdmin && transfer.toBranchId !== userBranchId) {
        throw new ForbiddenException({ code: 'BRANCH_SCOPE_VIOLATION', message: 'Only destination branch can receive' });
      }

      if (transfer.status !== 'in_transit') {
        throw new ConflictException({ code: 'INVALID_STATUS_TRANSITION', message: 'Only in_transit transfers can be received' });
      }

      // 2. Lock motorcycles
      const items = await tx.transferItem.findMany({ where: { transferId: id }, select: { motorcycleId: true } });
      const motorcycleIds = items.map(i => i.motorcycleId);

      const lockedMotorcycles = await tx.$queryRaw<{ id: string; status: string; vin: string }[]>`
        SELECT id, status, vin FROM "Motorcycle" WHERE id = ANY(ARRAY[${Prisma.join(motorcycleIds)}]::uuid[]) FOR UPDATE
      `;

      // 3. Optional guard: Verify they are in_transfer
      for (const m of lockedMotorcycles) {
        if (m.status !== 'in_transfer') {
           throw new ConflictException({ code: 'MOTORCYCLE_STATUS_CHANGED', message: `Motorcycle ${m.vin} is not in_transfer (${m.status})` });
        }
      }

      // 4. Update states
      await tx.motorcycle.updateMany({
        where: { id: { in: motorcycleIds } },
        data: { status: 'available', branchId: transfer.toBranchId },
      });

      const updated = await tx.transfer.update({
        where: { id },
        data: { status: 'received', completedAt: new Date() },
      });

      await this.audit.log({
        userId,
        action: 'UPDATE_STATUS',
        entityType: 'transfer',
        entityId: id,
        branchId: transfer.toBranchId,
        before: { status: 'in_transit' },
        after: { status: 'received' },
      });

      try {
        this.socketGateway.server?.emit('inventory:transfer_received', {
          transferId: id,
          fromBranchId: transfer.fromBranchId,
          toBranchId: transfer.toBranchId,
          status: 'received',
        });
      } catch { /* Fire and forget */ }

      // We need to return an object matching the spec (transfer details + updated motorcycles)
      const motorcycles = lockedMotorcycles.map(m => ({
        id: m.id,
        vin: m.vin,
        status: 'available',
        branchId: transfer.toBranchId,
      }));

      return {
        ...updated,
        motorcycles,
      };
    });
  }

  async cancel(id: string, userId: string, userBranchId: string | null, isSuperAdmin: boolean) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the transfer
      const lockResult = await tx.$queryRaw<{ id: string; status: string; fromBranchId: string }[]>`
        SELECT id, status, "fromBranchId" FROM "Transfer" WHERE id = ${id}::uuid FOR UPDATE
      `;

      if (lockResult.length === 0) {
        throw new NotFoundException({ code: 'TRANSFER_NOT_FOUND', message: 'Transfer not found' });
      }

      const transfer = lockResult[0];

      if (!isSuperAdmin && transfer.fromBranchId !== userBranchId) {
        throw new ForbiddenException({ code: 'BRANCH_SCOPE_VIOLATION', message: 'Only source branch can cancel' });
      }

      if (transfer.status !== 'initiated') {
        throw new ConflictException({ code: 'INVALID_STATUS_TRANSITION', message: 'Only initiated transfers can be cancelled' });
      }

      const updated = await tx.transfer.update({
        where: { id },
        data: { status: 'cancelled' },
      });

      await this.audit.log({
        userId,
        action: 'UPDATE_STATUS',
        entityType: 'transfer',
        entityId: id,
        branchId: transfer.fromBranchId,
        before: { status: 'initiated' },
        after: { status: 'cancelled' },
      });

      return updated;
    });
  }
}
