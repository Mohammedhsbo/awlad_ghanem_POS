import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SocketGateway } from '../socket/socket.gateway.js';
import { OrdersService } from '../orders/orders.service.js';
import {
  CreateReservationRequest,
  UpdateReservationRequest,
  CancelReservationRequest,
  ExtendReservationRequest,
  MIN_DEPOSIT_PERCENT,
  MIN_DEPOSIT_AMOUNT_EGP,
  DEFAULT_RESERVATION_DAYS,
  MAX_RESERVATION_DAYS,
} from '@motorcycle-system/shared-types';
import {
  generateReservationNumber,
} from '../utils/reservationNumberGenerator.js';
import { withUniqueRetry } from '../utils/number-generator.js';

@Injectable()
export class ReservationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SocketGateway) private readonly socketGateway: SocketGateway,
    @Inject(OrdersService) private readonly ordersService: OrdersService,
  ) {}

  /**
   * TASK-004: Create new reservation
   * - E-commerce customer reservation
   * - POS reservation
   * - Atomic motorcycle allocation with SELECT ... FOR UPDATE
   * - Concurrency protection
   */
  async create(
    data: CreateReservationRequest,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
    isCustomer: boolean = false,
  ) {
    // 1. Validate customer exists and is active
    const customer = await this.prisma.customer.findUnique({
      where: { id: data.customerId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        isActive: true,
        addresses: {
          where: { isDefault: true },
          take: 1,
          select: {
            addressLine: true,
            city: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found',
      });
    }

    if (!customer.isActive) {
      throw new ConflictException({
        code: 'CUSTOMER_INACTIVE',
        message: 'Customer is inactive',
      });
    }

    // 2. Determine branch
    let branchId = data.branchId ?? userBranchId;

    // If branch not specified, get it from motorcycle
    if (!branchId) {
      const moto = await this.prisma.motorcycle.findUnique({
        where: { id: data.motorcycleId },
        select: { branchId: true },
      });
      if (!moto) {
        throw new NotFoundException({
          code: 'MOTORCYCLE_NOT_FOUND',
          message: 'Motorcycle not found',
        });
      }
      branchId = moto.branchId;
    }

    // 3. Validate branch scope for staff
    if (!isCustomer && !isSuperAdmin && branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only create reservations for your own branch',
      });
    }

    // 4. Validate branch exists
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
      },
    });

    if (!branch) {
      throw new NotFoundException({
        code: 'BRANCH_NOT_FOUND',
        message: 'Branch not found',
      });
    }

    // 5. Calculate expiration date
    const expirationDays = data.expirationDays ?? DEFAULT_RESERVATION_DAYS;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    // 6. Use transaction with retry for unique constraint handling
    return withUniqueRetry(async () => {
      const branchCode = branch.nameEn.substring(0, 3).toUpperCase();
      const reservationNumber = await generateReservationNumber(
        this.prisma,
        branchCode,
      );

      return this.prisma.$transaction(
        async (tx) => {
          // 7. Lock motorcycle with FOR UPDATE
          const motorcycleRaw = await tx.$queryRaw<Array<any>>`
            SELECT m.id, m.vin, m.model, m.year, m.color, m.price, m.status, m."branchId", m."brandId"
            FROM "Motorcycle" m
            WHERE m.id = ${data.motorcycleId}::uuid
            FOR UPDATE
          `;

          if (!motorcycleRaw || motorcycleRaw.length === 0) {
            throw new NotFoundException({
              code: 'MOTORCYCLE_NOT_FOUND',
              message: 'Motorcycle not found',
            });
          }

          const motorcycle = motorcycleRaw[0];

          // 8. Validate motorcycle is available
          if (motorcycle.status !== 'available') {
            throw new ConflictException({
              code: 'MOTORCYCLE_NOT_AVAILABLE',
              message: `Motorcycle ${motorcycle.vin} is ${motorcycle.status}, not available`,
            });
          }

          // 9. Validate motorcycle is in the correct branch
          if (motorcycle.branchId !== branchId) {
            throw new ConflictException({
              code: 'MOTORCYCLE_WRONG_BRANCH',
              message: `Motorcycle ${motorcycle.vin} is not in the specified branch`,
            });
          }

          // 10. Snapshot motorcycle price
          const totalPrice = Number(motorcycle.price);

          // 11. Validate deposit amount
          const paidAmount = data.paidAmount;

          if (paidAmount <= 0) {
            throw new BadRequestException({
              code: 'INVALID_DEPOSIT_AMOUNT',
              message: 'Deposit must be greater than 0',
            });
          }

          const minDeposit = Math.max(
            totalPrice * MIN_DEPOSIT_PERCENT,
            MIN_DEPOSIT_AMOUNT_EGP,
          );

          if (paidAmount < minDeposit) {
            throw new BadRequestException({
              code: 'INVALID_DEPOSIT_AMOUNT',
              message: `Deposit must be at least ${minDeposit.toFixed(2)} EGP`,
            });
          }

          if (paidAmount > totalPrice) {
            throw new BadRequestException({
              code: 'INVALID_DEPOSIT_AMOUNT',
              message: 'Deposit cannot exceed motorcycle price',
            });
          }

          // 12. Calculate remaining amount
          const remainingAmount = totalPrice - paidAmount;

          // 13. Capture address at reservation time (use provided address or customer's default)
          let reservationAddress: string | null = null;
          if (data.address) {
            reservationAddress = data.address;
          } else if (customer.addresses && customer.addresses.length > 0) {
            const addr = customer.addresses[0];
            reservationAddress = `${addr.addressLine}${addr.city ? `, ${addr.city}` : ''}`;
          }

          // 14. Update motorcycle status to 'reserved'
          await tx.motorcycle.update({
            where: { id: data.motorcycleId },
            data: { status: 'reserved' },
          });

          // 15. Create reservation
          const reservation = await tx.reservation.create({
            data: {
              reservationNumber,
              customerId: data.customerId,
              motorcycleId: data.motorcycleId,
              branchId,
              userId: isCustomer ? undefined : userId,
              status: 'active',
              totalPrice,
              paidAmount,
              remainingAmount,
              address: reservationAddress,
              expiresAt,
              notes: data.notes,
            },
          });

          // 15. Get brand info
          const brand = await tx.brand.findUnique({
            where: { id: motorcycle.brandId },
            select: { id: true, nameAr: true, nameEn: true },
          });

          // 16. Audit log
          await this.audit.log({
            userId,
            isCustomerActor: isCustomer,
            action: 'reservation:created',
            entityType: 'reservation',
            entityId: reservation.id,
            branchId,
            after: {
              reservationNumber: reservation.reservationNumber,
              status: reservation.status,
              totalPrice: totalPrice,
              paidAmount,
              expiresAt: expiresAt.toISOString(),
            },
          });

          // 17. Emit WebSocket event
          if (
            this.socketGateway &&
            typeof (this.socketGateway as any).server?.emit === 'function'
          ) {
            (this.socketGateway as any).server.emit('reservation:created', {
              reservationId: reservation.id,
              reservationNumber: reservation.reservationNumber,
              customerId: data.customerId,
              motorcycleId: data.motorcycleId,
              branchId,
              totalPrice,
              paidAmount,
              expiresAt: expiresAt.toISOString(),
            });
          }

          // 18. Build response
          return {
            id: reservation.id,
            reservationNumber: reservation.reservationNumber,
            customer: {
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
            },
            motorcycle: {
              id: motorcycle.id,
              vin: motorcycle.vin,
              model: motorcycle.model,
              brand: brand!,
              currentStatus: 'reserved',
            },
            branch: {
              id: branch.id,
              nameAr: branch.nameAr,
              nameEn: branch.nameEn,
            },
            user: {
              id: userId,
              name: 'Staff',
            },
            status: reservation.status,
            totalPrice: Number(reservation.totalPrice),
            paidAmount: Number(reservation.paidAmount),
            remainingAmount: Number(reservation.remainingAmount),
            expiresAt: reservation.expiresAt?.toISOString() ?? null,
            notes: reservation.notes,
            createdAt: reservation.createdAt.toISOString(),
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000,
        },
      );
    });
  }

  /**
   * TASK-005: List reservations with pagination, search, and filters
   */
  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    customerId?: string;
    branchId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    expiringBefore?: string;
    sort?: string;
    order?: string;
    userId?: string;
    userBranchId?: string | null;
    isSuperAdmin?: boolean;
    isCustomer?: boolean;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const sort = params.sort ?? 'createdAt';
    const order = params.order ?? 'desc';

    // Build where clause
    const where: Prisma.ReservationWhereInput = {};

    // Branch scoping
    if (params.isCustomer) {
      where.customerId = params.userId;
    } else if (!params.isSuperAdmin && params.userBranchId) {
      where.branchId = params.userBranchId;
    }

    // Filters
    if (params.customerId) {
      where.customerId = params.customerId;
    }

    if (params.branchId) {
      where.branchId = params.branchId;
    }

    if (params.status) {
      where.status = params.status as any;
    }

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) {
        where.createdAt.gte = new Date(params.startDate);
      }
      if (params.endDate) {
        where.createdAt.lte = new Date(params.endDate);
      }
    }

    if (params.expiringBefore) {
      where.expiresAt = {
        lte: new Date(params.expiringBefore),
      };
    }

    // Search
    if (params.search) {
      const searchTerm = params.search.trim();
      where.OR = [
        { reservationNumber: { contains: searchTerm, mode: 'insensitive' } },
        { customer: { name: { contains: searchTerm, mode: 'insensitive' } } },
        { customer: { phone: { contains: searchTerm, mode: 'insensitive' } } },
        { motorcycle: { vin: { contains: searchTerm, mode: 'insensitive' } } },
      ];
    }

    // Get total count
    const total = await this.prisma.reservation.count({ where });

    // Get reservations
    const reservations = await this.prisma.reservation.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sort]: order },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        motorcycle: {
          select: {
            id: true,
            vin: true,
            model: true,
            brand: {
              select: {
                nameAr: true,
                nameEn: true,
              },
            },
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
    });

    // Calculate daysUntilExpiry for each reservation
    const now = new Date();
    const items = reservations.map((res) => {
      let daysUntilExpiry = null;
      if (res.expiresAt) {
        const diff = res.expiresAt.getTime() - now.getTime();
        daysUntilExpiry = Math.ceil(diff / (1000 * 60 * 60 * 24));
      }

      return {
        id: res.id,
        reservationNumber: res.reservationNumber,
        customer: res.customer,
        motorcycle: res.motorcycle,
        branch: res.branch,
        status: res.status,
        totalPrice: Number(res.totalPrice),
        paidAmount: Number(res.paidAmount),
        remainingAmount: Number(res.remainingAmount),
        expiresAt: res.expiresAt?.toISOString() ?? null,
        daysUntilExpiry,
        createdAt: res.createdAt.toISOString(),
      };
    });

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

  /**
   * TASK-005: Get single reservation with full details
   */
  async findOne(
    id: string,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
    isCustomer: boolean = false,
  ) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            addresses: {
              where: { isDefault: true },
              take: 1,
              select: {
                addressLine: true,
                city: true,
              },
            },
          },
        },
        motorcycle: {
          select: {
            id: true,
            vin: true,
            model: true,
            year: true,
            color: true,
            status: true,
            price: true,
            brand: {
              select: {
                id: true,
                nameAr: true,
                nameEn: true,
              },
            },
          },
        },
        branch: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        convertedOrder: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
          },
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        message: 'Reservation not found',
      });
    }

    // Authorization checks
    if (isCustomer && reservation.customerId !== userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only view your own reservations',
      });
    }

    if (!isCustomer && !isSuperAdmin && reservation.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only view reservations from your own branch',
      });
    }

    // Calculate daysUntilExpiry
    let daysUntilExpiry = null;
    if (reservation.expiresAt) {
      const now = new Date();
      const diff = reservation.expiresAt.getTime() - now.getTime();
      daysUntilExpiry = Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    // Get status history from audit log
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'reservation',
        entityId: id,
        action: { startsWith: 'reservation:' },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const statusHistory = auditLogs.map((log) => ({
      status: (log.after as any)?.status ?? reservation.status,
      changedAt: log.createdAt.toISOString(),
      changedBy: log.user,
      reason: (log.after as any)?.reason ?? null,
    }));

    return {
      id: reservation.id,
      reservationNumber: reservation.reservationNumber,
      customer: {
        ...reservation.customer,
        defaultAddress: reservation.customer.addresses[0] ?? null,
      },
      motorcycle: {
        ...reservation.motorcycle,
        currentStatus: reservation.motorcycle.status,
        currentPrice: !isCustomer ? Number(reservation.motorcycle.price) : undefined,
      },
      branch: reservation.branch,
      user: reservation.user,
      status: reservation.status,
      totalPrice: Number(reservation.totalPrice),
      paidAmount: Number(reservation.paidAmount),
      remainingAmount: Number(reservation.remainingAmount),
      expiresAt: reservation.expiresAt?.toISOString() ?? null,
      daysUntilExpiry,
      notes: reservation.notes,
      convertedOrder: reservation.convertedOrder,
      statusHistory,
      createdAt: reservation.createdAt.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
    };
  }

  /**
   * TASK-005: Get customer reservations (convenience endpoint)
   */
  async findByCustomer(
    customerId: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      userId?: string;
      isSuperAdmin?: boolean;
      isCustomer?: boolean;
    },
  ) {
    // Authorization: customer can only see their own
    if (params.isCustomer && customerId !== params.userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only view your own reservations',
      });
    }

    return this.findAll({
      ...params,
      customerId,
      userBranchId: null, // Customer data is not branch-scoped
      isSuperAdmin: params.isSuperAdmin,
      isCustomer: false, // We already validated customer access above
    });
  }

  /**
   * TASK-006: Update reservation (limited fields)
   * - Only active reservations can be updated
   * - Can update expiresAt and notes only
   */
  async update(
    id: string,
    data: UpdateReservationRequest,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
  ) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        branchId: true,
        reservationNumber: true,
        expiresAt: true,
        notes: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        message: 'Reservation not found',
      });
    }

    // Branch scope check
    if (!isSuperAdmin && reservation.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only update reservations from your own branch',
      });
    }

    // Can only update active reservations
    if (reservation.status !== 'active') {
      throw new ConflictException({
        code: 'RESERVATION_NOT_ACTIVE',
        message: `Cannot update ${reservation.status} reservation`,
      });
    }

    // Validate new expiration date if provided
    if (data.expiresAt) {
      const newExpiresAt = new Date(data.expiresAt);
      const now = new Date();

      if (newExpiresAt <= now) {
        throw new BadRequestException({
          code: 'INVALID_EXPIRATION_DATE',
          message: 'Expiration date must be in the future',
        });
      }

      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + MAX_RESERVATION_DAYS);

      if (newExpiresAt > maxDate) {
        throw new BadRequestException({
          code: 'INVALID_EXPIRATION_DATE',
          message: `Expiration date cannot be more than ${MAX_RESERVATION_DAYS} days from now`,
        });
      }
    }

    // Build update data
    const updateData: any = {};
    if (data.expiresAt !== undefined) {
      updateData.expiresAt = new Date(data.expiresAt);
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    // Update reservation
    const updated = await this.prisma.reservation.update({
      where: { id },
      data: updateData,
    });

    // Audit log
    await this.audit.log({
      userId,
      action: 'reservation:updated',
      entityType: 'reservation',
      entityId: id,
      branchId: reservation.branchId,
      before: {
        expiresAt: reservation.expiresAt?.toISOString() ?? null,
        notes: reservation.notes,
      },
      after: {
        expiresAt: updated.expiresAt?.toISOString() ?? null,
        notes: updated.notes,
      },
    });

    // Return full reservation details
    return this.findOne(id, userId, userBranchId, isSuperAdmin, false);
  }

  /**
   * TASK-006: Extend reservation expiration
   */
  async extend(
    id: string,
    data: ExtendReservationRequest,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
  ) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        branchId: true,
        reservationNumber: true,
        expiresAt: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        message: 'Reservation not found',
      });
    }

    // Branch scope check
    if (!isSuperAdmin && reservation.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only extend reservations from your own branch',
      });
    }

    // Can only extend active reservations
    if (reservation.status !== 'active') {
      throw new ConflictException({
        code: 'RESERVATION_NOT_ACTIVE',
        message: `Cannot extend ${reservation.status} reservation`,
      });
    }

    // Validate new expiration date
    const newExpiresAt = new Date(data.expiresAt);
    const now = new Date();

    if (newExpiresAt <= now) {
      throw new BadRequestException({
        code: 'INVALID_EXPIRATION_DATE',
        message: 'Expiration date must be in the future',
      });
    }

    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + MAX_RESERVATION_DAYS);

    if (newExpiresAt > maxDate) {
      throw new BadRequestException({
        code: 'INVALID_EXPIRATION_DATE',
        message: `Expiration date cannot be more than ${MAX_RESERVATION_DAYS} days from now`,
      });
    }

    // Update reservation
    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { expiresAt: newExpiresAt },
    });

    // Calculate daysUntilExpiry
    const diff = newExpiresAt.getTime() - now.getTime();
    const daysUntilExpiry = Math.ceil(diff / (1000 * 60 * 60 * 24));

    // Audit log
    await this.audit.log({
      userId,
      action: 'reservation:extended',
      entityType: 'reservation',
      entityId: id,
      branchId: reservation.branchId,
      before: {
        expiresAt: reservation.expiresAt?.toISOString() ?? null,
      },
      after: {
        expiresAt: newExpiresAt.toISOString(),
        reason: data.reason,
      },
    });

    // Emit WebSocket event
    if (
      this.socketGateway &&
      typeof (this.socketGateway as any).server?.emit === 'function'
    ) {
      (this.socketGateway as any).server.emit('reservation:extended', {
        reservationId: id,
        reservationNumber: reservation.reservationNumber,
        expiresAt: newExpiresAt.toISOString(),
        daysUntilExpiry,
      });
    }

    return {
      id: updated.id,
      reservationNumber: updated.reservationNumber,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      daysUntilExpiry,
    };
  }

  /**
   * TASK-007: Cancel reservation
   * - Only active reservations can be cancelled
   * - Atomically: status → cancelled, motorcycle → available
   * - Customer can cancel own reservation
   * - Staff can cancel according to permission
   */
  async cancel(
    id: string,
    data: CancelReservationRequest,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
    isCustomer: boolean = false,
  ) {
    return withUniqueRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          // Lock reservation
          const reservationRaw = await tx.$queryRaw<Array<any>>`
            SELECT r.id, r."reservationNumber", r.status, r."motorcycleId", r."customerId", r."branchId", r."paidAmount"
            FROM "Reservation" r
            WHERE r.id = ${id}::uuid
            FOR UPDATE
          `;

          if (!reservationRaw || reservationRaw.length === 0) {
            throw new NotFoundException({
              code: 'RESERVATION_NOT_FOUND',
              message: 'Reservation not found',
            });
          }

          const reservation = reservationRaw[0];

          // Authorization check
          if (isCustomer && reservation.customerId !== userId) {
            throw new ForbiddenException({
              code: 'FORBIDDEN',
              message: 'You can only cancel your own reservations',
            });
          }

          if (!isCustomer && !isSuperAdmin && reservation.branchId !== userBranchId) {
            throw new ForbiddenException({
              code: 'BRANCH_SCOPE_VIOLATION',
              message: 'You can only cancel reservations from your own branch',
            });
          }

          // Can only cancel active reservations
          if (reservation.status !== 'active') {
            throw new ConflictException({
              code: 'RESERVATION_NOT_ACTIVE',
              message: `Cannot cancel ${reservation.status} reservation`,
            });
          }

          // Update reservation status
          await tx.reservation.update({
            where: { id },
            data: {
              status: 'cancelled',
              penaltyAmount: data.requestRefund && reservation.paidAmount > 0 ? 300 : 0,
            },
          });

          // Update motorcycle to available
          await tx.motorcycle.update({
            where: { id: reservation.motorcycleId },
            data: { status: 'available' },
          });

          // Audit log
          await this.audit.log({
            userId,
            action: 'reservation:cancelled',
            entityType: 'reservation',
            entityId: id,
            branchId: reservation.branchId,
            before: {
              status: 'active',
            },
            after: {
              status: 'cancelled',
              penaltyAmount: data.requestRefund && reservation.paidAmount > 0 ? 300 : 0,
              reason: data.reason,
            },
          });

          // Emit WebSocket event
          if (
            this.socketGateway &&
            typeof (this.socketGateway as any).server?.emit === 'function'
          ) {
            (this.socketGateway as any).server.emit('reservation:cancelled', {
              reservationId: id,
              reservationNumber: reservation.reservationNumber,
              motorcycleId: reservation.motorcycleId,
              customerId: reservation.customerId,
              reason: data.reason,
            });
          }

          const penaltyAmount = data.requestRefund && Number(reservation.paidAmount) > 0 ? 300 : 0;
          return {
            success: true,
            penaltyAmount,
            refundableAmount: Math.max(Number(reservation.paidAmount) - penaltyAmount, 0),
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000,
        },
      )
    );
  }

  /**
   * TASK-007: Process expired reservations (background job)
   * - Find active reservations with expiresAt < NOW()
   * - Batch processing to avoid long transactions
   * - For each: status → expired, motorcycle → available
   */
  async processExpired(limit: number = 100) {
    const now = new Date();

    // Find expired reservations
    const expiredReservations = await this.prisma.reservation.findMany({
      where: {
        status: 'active',
        expiresAt: {
          lte: now,
        },
      },
      take: limit,
      select: {
        id: true,
        reservationNumber: true,
        customerId: true,
        motorcycleId: true,
        branchId: true,
      },
    });

    const processedResults: Array<{
      id: string;
      reservationNumber: string;
      customerId: string;
      motorcycleId: string;
    }> = [];

    // Process each reservation individually to avoid long transactions
    for (const reservation of expiredReservations) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            // Lock reservation
            const resRaw = await tx.$queryRaw<Array<any>>`
              SELECT r.id, r.status
              FROM "Reservation" r
              WHERE r.id = ${reservation.id}::uuid
              FOR UPDATE
            `;

            if (!resRaw || resRaw.length === 0) {
              return; // Already processed or deleted
            }

            const res = resRaw[0];

            // Re-check status (could have been cancelled/converted concurrently)
            if (res.status !== 'active') {
              return;
            }

            // Update reservation status
            await tx.reservation.update({
              where: { id: reservation.id },
              data: { status: 'expired' },
            });

            // Update motorcycle to available
            await tx.motorcycle.update({
              where: { id: reservation.motorcycleId },
              data: { status: 'available' },
            });

            // Audit log (using system user)
            await this.audit.log({
              userId: null,
              action: 'reservation:expired',
              entityType: 'reservation',
              entityId: reservation.id,
              branchId: reservation.branchId,
              before: {
                status: 'active',
              },
              after: {
                status: 'expired',
              },
            });

            // Emit WebSocket event
            if (
              this.socketGateway &&
              typeof (this.socketGateway as any).server?.emit === 'function'
            ) {
              (this.socketGateway as any).server.emit('reservation:expired', {
                reservationId: reservation.id,
                reservationNumber: reservation.reservationNumber,
                motorcycleId: reservation.motorcycleId,
                customerId: reservation.customerId,
              });
            }

            processedResults.push({
              id: reservation.id,
              reservationNumber: reservation.reservationNumber,
              customerId: reservation.customerId,
              motorcycleId: reservation.motorcycleId,
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (error) {
        console.error(`Failed to expire reservation ${reservation.id}:`, error);
        // Continue processing other reservations
      }
    }

    return {
      processedCount: processedResults.length,
      expiredReservations: processedResults,
    };
  }

  /**
   * TASK-008: Convert reservation to order
   */
  async convert(
    id: string,
    data: { notes?: string },
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
  ) {
    return withUniqueRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          // Lock reservation
          const resRaw = await tx.$queryRaw<Array<any>>`
            SELECT r.id, r."reservationNumber", r.status, r."motorcycleId", r."customerId", r."branchId", r."totalPrice", r."paidAmount", r."convertedOrderId", r."expiresAt", r.address
            FROM "Reservation" r
            WHERE r.id = ${id}::uuid
            FOR UPDATE
          `;

          if (!resRaw || resRaw.length === 0) {
            throw new NotFoundException({
              code: 'RESERVATION_NOT_FOUND',
              message: 'Reservation not found',
            });
          }

          const reservation = resRaw[0];

          // Authorization check
          if (!isSuperAdmin && reservation.branchId !== userBranchId) {
            throw new ForbiddenException({
              code: 'BRANCH_SCOPE_VIOLATION',
              message: 'You can only convert reservations from your own branch',
            });
          }

          // Validate state
          if (reservation.status !== 'active') {
            throw new ConflictException({
              code: 'RESERVATION_NOT_ACTIVE',
              message: `Cannot convert ${reservation.status} reservation`,
            });
          }

          if (reservation.convertedOrderId) {
            throw new ConflictException({
              code: 'RESERVATION_ALREADY_CONVERTED',
              message: 'Reservation has already been converted to an order',
            });
          }

          if (reservation.expiresAt && reservation.expiresAt < new Date()) {
            throw new ConflictException({
              code: 'RESERVATION_EXPIRED',
              message: 'Reservation has expired and cannot be converted',
            });
          }

          // Lock and validate motorcycle
          const motorcycleRaw = await tx.$queryRaw<Array<any>>`
            SELECT m.id, m.status 
            FROM "Motorcycle" m 
            WHERE m.id = ${reservation.motorcycleId}::uuid
            FOR UPDATE
          `;

          if (!motorcycleRaw || motorcycleRaw.length === 0) {
            throw new NotFoundException({
              code: 'MOTORCYCLE_NOT_FOUND',
              message: 'Reserved motorcycle not found',
            });
          }

          const motorcycle = motorcycleRaw[0];

          if (motorcycle.status !== 'reserved') {
            throw new ConflictException({
              code: 'MOTORCYCLE_NOT_RESERVED',
              message: `Motorcycle status is ${motorcycle.status}, expected reserved`,
            });
          }

          // Create order using existing SPEC-005 service (passing the transaction)
          const order = await this.ordersService.create(
            {
              customerId: reservation.customerId,
              branchId: reservation.branchId,
              motorcycleIds: [reservation.motorcycleId],
              discount: 0,
              address: reservation.address,
              notes: data.notes ?? `Converted from reservation ${reservation.reservationNumber}`,
              isDraft: false, // create as confirmed
            },
            userId,
            userBranchId,
            isSuperAdmin,
            false,
            {
              tx,
              skipMotorcycleStatusCheck: true, // skip because it's 'reserved', not 'available'
              priceOverrides: { [reservation.motorcycleId]: reservation.totalPrice }, // Preserve pricing snapshot
            }
          );

          // Update reservation to converted
          await tx.reservation.update({
            where: { id: reservation.id },
            data: {
              status: 'converted',
              convertedOrderId: order.id,
            },
          });

          // Audit log
          await this.audit.log({
            userId,
            action: 'reservation:converted',
            entityType: 'reservation',
            entityId: id,
            branchId: reservation.branchId,
            before: {
              status: 'active',
            },
            after: {
              status: 'converted',
              convertedOrderId: order.id,
            },
          });

          // Emit WebSocket event
          if (
            this.socketGateway &&
            typeof (this.socketGateway as any).server?.emit === 'function'
          ) {
            (this.socketGateway as any).server.emit('reservation:converted', {
              reservationId: id,
              reservationNumber: reservation.reservationNumber,
              orderId: order.id,
              orderNumber: order.orderNumber,
            });
          }

          return {
            id: reservation.id,
            reservationNumber: reservation.reservationNumber,
            status: 'converted',
            order: {
              id: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
              netAmount: order.netAmount,
            },
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000,
        }
      )
    );
  }

  /**
   * TASK-009: Get reservation history
   */
  async getHistory(
    id: string,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
    isCustomer: boolean = false,
  ) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      select: {
        id: true,
        customerId: true,
        branchId: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        message: 'Reservation not found',
      });
    }

    // Authorization checks
    if (isCustomer && reservation.customerId !== userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only view your own reservation history',
      });
    }

    if (!isCustomer && !isSuperAdmin && reservation.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only view history for reservations from your own branch',
      });
    }

    // Fetch history from audit logs
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'reservation',
        entityId: id,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      previousStatus: (log.before as any)?.status,
      newStatus: (log.after as any)?.status,
      reason: (log.after as any)?.reason,
      user: log.userId === 'system' ? { id: 'system', name: 'System' } : log.user,
      timestamp: log.createdAt.toISOString(),
    }));
  }
}
