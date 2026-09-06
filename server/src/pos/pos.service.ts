import {
  Inject,
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { MotorcyclesService } from '../motorcycles/motorcycles.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StorageService } from '../upload/storage.service.js';
import {
  POSDashboardData,
  POSCustomerSearchResult,
  POSCustomerSearchResponse,
  POSMotorcycleSearchResult,
  POSCustomerSearchQuery,
  POSMotorcycleSearchQuery,
  ValidatePOSTransactionDto,
  ValidatePOSTransactionResponse,
  CreatePOSTransactionDto,
  CreatePOSTransactionResponse,
  POSActiveReservationsQuery,
  POSActiveReservation,
  ConvertPOSReservationDto,
  POSErrorCode,
  getDiscountLimits,
  canApplyDiscount,
  MIN_DEPOSIT_PERCENT,
  MIN_DEPOSIT_AMOUNT_EGP,
  POSTransactionType,
} from '@motorcycle-system/shared-types';
import type { AuthenticatedUser } from '../common/types/authenticated-request.js';

@Injectable()
export class POSService {
  private idempotencyCache = new Map<string, { result: any; timestamp: number }>();
  private readonly IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CustomersService) private readonly customersService: CustomersService,
    @Inject(MotorcyclesService) private readonly motorcyclesService: MotorcyclesService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(StorageService) private readonly storageService: StorageService,
  ) {
    // Clean up idempotency cache every minute
    setInterval(() => this.cleanupIdempotencyCache(), 60 * 1000);
  }

  private cleanupIdempotencyCache() {
    const now = Date.now();
    for (const [key, value] of this.idempotencyCache.entries()) {
      if (now - value.timestamp > this.IDEMPOTENCY_WINDOW_MS) {
        this.idempotencyCache.delete(key);
      }
    }
  }

  async getDashboard(user: AuthenticatedUser): Promise<POSDashboardData> {
    const branchId = user.branchId;
    const isSuperAdmin = user.roleName === 'super_admin';

    // Super-admins have no assigned branch and see aggregate dashboard data.
    const branch = branchId
      ? await this.prisma.branch.findUnique({
          where: { id: branchId },
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
          },
        })
      : null;

    if (!branch && !isSuperAdmin) {
      throw new Error('Branch not found');
    }

    // Calculate today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's stats
    const [ordersCreated, reservationsCreated, orderSales, availableMotorcycles] =
      await Promise.all([
        // Orders created today
        this.prisma.desktopOrder.count({
          where: {
            branchId: branchId || undefined,
            createdAt: {
              gte: today,
              lt: tomorrow,
            },
          },
        }),

        // Reservations created today
        this.prisma.desktopReservation.count({
          where: {
            branchId: branchId || undefined,
            createdAt: {
              gte: today,
              lt: tomorrow,
            },
          },
        }),

        // Total sales today
        this.prisma.desktopOrder.aggregate({
          where: {
            branchId: branchId || undefined,
            createdAt: {
              gte: today,
              lt: tomorrow,
            },
            status: {
              in: ['confirmed', 'completed'],
            },
          },
          _sum: {
            netAmount: true,
          },
        }),

        // Available motorcycles count
        this.prisma.motorcycle.count({
          where: {
            branchId: branchId || undefined,
            status: 'available',
          },
        }),
      ]);

    // Get recent transactions (last 10)
    const recentOrders = await this.prisma.desktopOrder.findMany({
      where: {
        branchId: branchId || undefined,
      },
      take: 10,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        orderNumber: true,
        netAmount: true,
        createdAt: true,
        customer: {
          select: {
            name: true,
          },
        },
        items: {
          select: {
            motorcycle: {
              select: {
                model: true,
              },
            },
          },
          take: 1,
        },
      },
    });

    const recentReservations = await this.prisma.desktopReservation.findMany({
      where: {
        branchId: branchId || undefined,
      },
      take: 5,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        reservationNumber: true,
        createdAt: true,
      },
    });

    // Combine and sort recent transactions
    const recentTransactions: Array<{
      id: string;
      type: 'order' | 'reservation';
      number: string;
      customerName: string;
      motorcycleModel: string;
      amount: number;
      createdAt: string;
    }> = [
      ...recentOrders.map((order) => ({
        id: order.id,
        type: 'order' as const,
        number: order.orderNumber,
        customerName: order.customer?.name || 'Unknown',
        motorcycleModel: order.items[0]?.motorcycle?.model || 'Unknown',
        amount: Number(order.netAmount),
        createdAt: order.createdAt.toISOString(),
      })),
      ...recentReservations.map((res) => ({
        id: res.id,
        type: 'reservation' as const,
        number: res.reservationNumber,
        customerName: 'N/A',
        motorcycleModel: 'N/A',
        amount: 0,
        createdAt: res.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    // Get discount limits for user's role
    const discountLimits = getDiscountLimits(user.roleName);

    // Check permissions
    const hasCustomerCreate = user.permissions.some(
      (p: any) => p.resource === 'customer' && p.action === 'create',
    );

    return {
      currentUser: {
        id: user.id,
        name: user.name,
        role: user.roleName,
        branch: branch
          ? {
              id: branch.id,
              nameAr: branch.nameAr,
              nameEn: branch.nameEn,
            }
          : null,
        permissions: {
          canApplyDiscount: true, // All authenticated users can attempt, validated server-side
          maxDiscountPercent: discountLimits.maxPercent,
          maxDiscountAmount: discountLimits.maxAmount,
          canCreateCustomer: hasCustomerCreate,
          canSwitchBranch: isSuperAdmin,
        },
      },
      todayStats: {
        ordersCreated,
        reservationsCreated,
        totalSales: Number(orderSales._sum?.netAmount || 0),
        availableMotorcycles,
      },
      recentTransactions,
    };
  }

  async searchCustomers(
    query: POSCustomerSearchQuery,
  ): Promise<POSCustomerSearchResponse> {
    const trimmedQ = query.q.trim();
    const skip = (query.page - 1) * query.limit;
    let customers;
    let total: number;

    if (!trimmedQ) {
      const where = { isActive: true };
      [total, customers] = await Promise.all([
        this.prisma.customer.count({ where }),
        this.prisma.customer.findMany({
          where,
          include: { addresses: { where: { isDefault: true }, take: 1 } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: query.limit,
        }),
      ]);
    } else {
      const normalizedQ = trimmedQ.replace(/[\s-]/g, '');
      const baseWhere = { isActive: true };
      const searchConditions: any[] = [
        { ...baseWhere, phone: { equals: normalizedQ } },
        { ...baseWhere, phone: { contains: normalizedQ } },
        { ...baseWhere, name: { contains: trimmedQ, mode: 'insensitive' } },
        { ...baseWhere, email: { contains: trimmedQ, mode: 'insensitive' } },
      ];
      if (/^[a-zA-Z0-9]+$/.test(normalizedQ)) {
        searchConditions.push({ ...baseWhere, nationalId: { equals: normalizedQ } });
      }
      const where = { OR: searchConditions };
      [total, customers] = await Promise.all([
        this.prisma.customer.count({ where }),
        this.prisma.customer.findMany({
          where,
          include: { addresses: { where: { isDefault: true }, take: 1 } },
          skip,
          take: query.limit,
        }),
      ]);
    }

    // Enhance with POS-specific data
    const enhancedCustomers = await Promise.all(
      customers.map(async (customer) => {
        // Get recent order count (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [recentOrderCount, activeReservationCount, lastOrder, defaultAddress] =
          await Promise.all([
            this.prisma.desktopOrder.count({
              where: {
                customerId: customer.id,
                createdAt: {
                  gte: thirtyDaysAgo,
                },
              },
            }),

            this.prisma.desktopReservation.count({
              where: {
                customerId: customer.id,
                status: 'active',
              },
            }),

            this.prisma.desktopOrder.findFirst({
              where: {
                customerId: customer.id,
              },
              orderBy: {
                createdAt: 'desc',
              },
              select: {
                createdAt: true,
              },
            }),

            this.prisma.address.findFirst({
              where: {
                customerId: customer.id,
              },
              select: {
                addressLine: true,
                city: true,
              },
            }),
          ]);

        return {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email || undefined,
          recentOrderCount,
          activeReservationCount,
          lastTransactionDate: lastOrder?.createdAt.toISOString(),
          defaultAddress: defaultAddress
            ? {
                addressLine: defaultAddress.addressLine,
                city: defaultAddress.city || undefined,
              }
            : undefined,
        };
      }),
    );

    return {
      items: enhancedCustomers,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async searchMotorcycles(
    query: POSMotorcycleSearchQuery,
    user: AuthenticatedUser,
  ): Promise<POSMotorcycleSearchResult[]> {
    const isSuperAdmin = user.roleName === 'super_admin';
    const branchId = isSuperAdmin ? query.branchId || user.branchId : user.branchId;

    if (!branchId && !isSuperAdmin) {
      throw new Error('Branch ID required');
    }

    // Build where clause
    const where: any = {
      status: 'available',
    };

    // Branch filter (unless super_admin searching across branches)
    if (branchId) {
      where.branchId = branchId;
    } else if (!isSuperAdmin) {
      where.branchId = user.branchId;
    }

    // Search term
    if (query.q) {
      where.OR = [
        { vin: { contains: query.q, mode: 'insensitive' } },
        { model: { contains: query.q, mode: 'insensitive' } },
        {
          brand: {
            OR: [
              { nameAr: { contains: query.q, mode: 'insensitive' } },
              { nameEn: { contains: query.q, mode: 'insensitive' } },
            ],
          },
        },
        {
          category: {
            OR: [
              { nameAr: { contains: query.q, mode: 'insensitive' } },
              { nameEn: { contains: query.q, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const motorcycles = await this.prisma.motorcycle.findMany({
      where,
      take: query.limit,
      select: {
        id: true,
        vin: true,
        model: true,
        year: true,
        color: true,
        price: true,
        status: true,
        images: true,
        brand: {
          select: {
            nameAr: true,
            nameEn: true,
            logo: true,
          },
        },
        category: {
          select: {
            nameAr: true,
            nameEn: true,
          },
        },
      },
    });

    return motorcycles.map((m) => ({
      id: m.id,
      vin: m.vin,
      model: m.model,
      year: m.year,
      color: m.color || undefined,
      brand: {
        nameAr: m.brand.nameAr,
        nameEn: m.brand.nameEn,
        logo: m.brand.logo || undefined,
      },
      category: {
        nameAr: m.category.nameAr,
        nameEn: m.category.nameEn,
      },
      price: Number(m.price),
      status: m.status,
      images: Array.isArray(m.images) ? (m.images as string[]) : [],
    }));
  }

  // ─────────────────────────────────────────────────────────
  // TASK-003: Transaction Validation & Creation
  // ─────────────────────────────────────────────────────────

  async validateTransaction(
    dto: ValidatePOSTransactionDto,
    user: AuthenticatedUser,
  ): Promise<ValidatePOSTransactionResponse> {
    // Validate customer
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });

    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found',
      });
    }

    // Validate motorcycle
    const motorcycle = await this.prisma.motorcycle.findUnique({
      where: { id: dto.motorcycleId },
      select: {
        id: true,
        vin: true,
        model: true,
        price: true,
        status: true,
        branchId: true,
      },
    });

    if (!motorcycle) {
      throw new NotFoundException({
        code: 'MOTORCYCLE_NOT_FOUND',
        message: 'Motorcycle not found',
      });
    }

    // Branch validation
    const isSuperAdmin = user.roleName === 'super_admin';
    if (!isSuperAdmin && motorcycle.branchId !== user.branchId) {
      throw new BadRequestException({
        code: POSErrorCode.BRANCH_SCOPE_VIOLATION,
        message: 'Motorcycle not in your branch',
      });
    }

    const isAvailable = motorcycle.status === 'available';
    const totalAmount = Number(motorcycle.price);
    const discountAmount = dto.discount || 0;
    const netAmount = totalAmount - discountAmount;

    // Validate discount
    const discountAuth = canApplyDiscount(discountAmount, totalAmount, user.roleName);

    // Validate deposit for reservations
    const warnings: string[] = [];
    let depositAmount: number | undefined;
    let remainingAmount: number | undefined;

    if (dto.type === 'reservation' && dto.depositAmount !== undefined) {
      depositAmount = dto.depositAmount;
      const minDeposit = Math.max(
        totalAmount * (MIN_DEPOSIT_PERCENT / 100),
        MIN_DEPOSIT_AMOUNT_EGP,
      );

      if (depositAmount < minDeposit) {
        throw new BadRequestException({
          code: POSErrorCode.INVALID_DEPOSIT_AMOUNT,
          message: `Deposit must be at least ${minDeposit} EGP`,
        });
      }

      if (depositAmount > netAmount) {
        throw new BadRequestException({
          code: POSErrorCode.INVALID_DEPOSIT_AMOUNT,
          message: 'Deposit cannot exceed net amount',
        });
      }

      remainingAmount = netAmount - depositAmount;
    }

    if (!customer.isActive) {
      warnings.push('Customer is inactive');
    }

    if (!isAvailable) {
      warnings.push('Motorcycle is not available');
    }

    return {
      valid: customer.isActive && isAvailable && discountAuth.authorized,
      customer: {
        id: customer.id,
        name: customer.name,
        isActive: customer.isActive,
      },
      motorcycle: {
        id: motorcycle.id,
        vin: motorcycle.vin,
        model: motorcycle.model,
        price: totalAmount,
        status: motorcycle.status,
        isAvailable,
      },
      calculations: {
        totalAmount,
        discountAmount,
        netAmount,
        depositAmount,
        remainingAmount,
      },
      discountAuthorization: discountAuth,
      warnings,
    };
  }

  async createTransaction(
    dto: CreatePOSTransactionDto,
    user: AuthenticatedUser,
  ): Promise<CreatePOSTransactionResponse> {
    const cached = this.idempotencyCache.get(dto.idempotencyKey);
    if (cached) {
      return cached.result;
    }

    const validation = await this.validateTransaction(
      {
        customerId: dto.customerId,
        motorcycleId: dto.motorcycleId,
        type: dto.type,
        discount: dto.discount?.amount,
        depositAmount: dto.reservationData?.depositAmount,
      },
      user,
    );

    if (!validation.valid) {
      if (!validation.customer.isActive) {
        throw new ConflictException({
          code: POSErrorCode.CUSTOMER_INACTIVE,
          message: 'Customer is inactive',
        });
      }
      if (!validation.motorcycle.isAvailable) {
        throw new ConflictException({
          code: POSErrorCode.MOTORCYCLE_NOT_AVAILABLE,
          message: 'Motorcycle is not available',
        });
      }
      if (!validation.discountAuthorization.authorized) {
        throw new BadRequestException({
          code: POSErrorCode.DISCOUNT_UNAUTHORIZED,
          message: validation.discountAuthorization.reason || 'Discount not authorized',
        });
      }
    }

    const motorcycle = await this.prisma.motorcycle.findUnique({
      where: { id: dto.motorcycleId },
      include: { brand: { select: { nameAr: true, nameEn: true } } },
    });
    if (!motorcycle) throw new NotFoundException('Motorcycle not found');
    const branchId = user.branchId ?? motorcycle.branchId;
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('Branch not found');
    const branchCode = branch.nameEn.substring(0, 3).toUpperCase();

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM "Motorcycle" WHERE id = ${dto.motorcycleId}::uuid FOR UPDATE
      `;
      if (!locked[0] || locked[0].status !== 'available') {
        throw new ConflictException({ code: POSErrorCode.MOTORCYCLE_NOT_AVAILABLE, message: 'Motorcycle is not available' });
      }

      if (dto.type === 'order') {
        const totalAmount = validation.calculations.totalAmount;
        const discount = validation.calculations.discountAmount;
        const order = await tx.desktopOrder.create({
          data: {
            orderNumber: `DORD-${branchCode}-${Date.now()}`,
            customerId: dto.customerId,
            branchId,
            userId: user.id,
            status: 'completed',
            paymentType: 'INSTALLMENT',
            totalAmount,
            discount,
            netAmount: validation.calculations.netAmount,
            address: dto.address,
            notes: dto.notes,
            idempotencyKey: dto.idempotencyKey,
            items: { create: { motorcycleId: dto.motorcycleId, unitPrice: totalAmount, discount } },
          },
          include: { customer: true },
        });
        await tx.motorcycle.update({ where: { id: dto.motorcycleId }, data: { status: 'sold' } });
        return {
          id: order.id, type: 'order' as const, number: order.orderNumber,
          customer: { id: order.customer.id, name: order.customer.name, phone: order.customer.phone },
          motorcycle: { id: motorcycle.id, vin: motorcycle.vin, model: motorcycle.model, brand: motorcycle.brand },
          totalAmount, discount, netAmount: validation.calculations.netAmount,
          createdAt: order.createdAt.toISOString(),
        };
      }

      const depositAmount = dto.reservationData!.depositAmount;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (dto.reservationData?.expirationDays ?? 7));
      const reservation = await tx.desktopReservation.create({
        data: {
          reservationNumber: `DRES-${branchCode}-${Date.now()}`,
          customerId: dto.customerId,
          motorcycleId: dto.motorcycleId,
          branchId,
          userId: user.id,
          status: 'active',
          totalPrice: validation.calculations.netAmount,
          paidAmount: depositAmount,
          remainingAmount: validation.calculations.remainingAmount || 0,
          address: dto.address,
          expiresAt,
          notes: dto.notes,
          idempotencyKey: dto.idempotencyKey,
        },
        include: { customer: true },
      });
      await tx.motorcycle.update({ where: { id: dto.motorcycleId }, data: { status: 'reserved' } });
      return {
        id: reservation.id, type: 'reservation' as const, number: reservation.reservationNumber,
        customer: { id: reservation.customer.id, name: reservation.customer.name, phone: reservation.customer.phone },
        motorcycle: { id: motorcycle.id, vin: motorcycle.vin, model: motorcycle.model, brand: motorcycle.brand },
        totalAmount: validation.calculations.totalAmount, discount: 0,
        netAmount: validation.calculations.netAmount, depositAmount,
        remainingAmount: validation.calculations.remainingAmount || 0,
        expiresAt: expiresAt.toISOString(), createdAt: reservation.createdAt.toISOString(),
      };
    });

    this.idempotencyCache.set(dto.idempotencyKey, { result, timestamp: Date.now() });
    await this.auditService.log({
      userId: user.id,
      action: `pos_${dto.type}_created`,
      entityType: dto.type === 'order' ? 'desktop_order' : 'desktop_reservation',
      entityId: result.id,
      after: { motorcycleId: dto.motorcycleId, idempotencyKey: dto.idempotencyKey },
    });
    return result;
  }

  async createDirectReservation(data: { customerName: string; customerPhone: string; motorcycleId: string; holdAmount: number }, user: AuthenticatedUser, file?: Express.Multer.File) {
    const customer = await this.prisma.customer.upsert({
      where: { phone: data.customerPhone },
      create: { name: data.customerName, phone: data.customerPhone },
      update: { name: data.customerName },
    });
    const customerIdImage = file ? (await this.storageService.uploadFile(file, 'sales/id-images')).url : undefined;
    const result = await this.createTransaction({
      type: POSTransactionType.RESERVATION,
      customerId: customer.id,
      motorcycleId: data.motorcycleId,
      reservationData: { depositAmount: data.holdAmount, expirationDays: 7 },
      idempotencyKey: `pos-reservation-${user.id}-${data.motorcycleId}-${Date.now()}`,
    }, user);

    if (result.id && customerIdImage) {
      const reservation = await this.prisma.desktopReservation.findUnique({ where: { id: result.id } });
      if (reservation) {
        await this.prisma.desktopReservation.update({
          where: { id: reservation.id },
          data: { customerIdImage },
        });
      }
    }

    return { ...result, customerIdImage };
  }

  async createCashSale(
    data: {
      motorcycleId: string;
      customerName: string;
      customerPhone: string;
      salePrice: number;
      paymentMethod: 'CASH' | 'VISA';
      branchId?: string | null;
    },
    user: AuthenticatedUser,
    file?: Express.Multer.File,
  ) {
    let customerIdImage: string | undefined;
    if (file) customerIdImage = (await this.storageService.uploadFile(file, 'sales/id-images')).url;

    const motorcycle = await this.prisma.motorcycle.findUnique({ where: { id: data.motorcycleId }, include: { brand: true } });
    if (!motorcycle) throw new NotFoundException('Motorcycle not found');

    const branchId = data.branchId ?? user.branchId ?? motorcycle.branchId;

    if (!branchId) {
      throw new BadRequestException('Branch is required');
    }

    if (user.roleName !== 'super_admin' && data.branchId && data.branchId !== user.branchId) {
      throw new BadRequestException('Cannot sell from another branch');
    }

    if (user.roleName !== 'super_admin' && user.branchId !== branchId) {
      throw new BadRequestException('Branch scope mismatch');
    }

    if (motorcycle.branchId !== branchId) {
      throw new BadRequestException('Motorcycle not in your branch');
    }

    const customer = await this.prisma.customer.upsert({ where: { phone: data.customerPhone }, create: { name: data.customerName, phone: data.customerPhone }, update: { name: data.customerName } });
    const order = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM "Motorcycle" WHERE id = ${data.motorcycleId}::uuid FOR UPDATE`;
      if (locked[0]?.status !== 'available') throw new ConflictException('Motorcycle is not available');
      const created = await tx.desktopOrder.create({
        data: {
          orderNumber: `DORD-${branchId.substring(0, 8)}-${Date.now()}`,
          customerId: customer.id, branchId, userId: user.id,
          status: 'completed', paymentType: 'CASH', totalAmount: data.salePrice, discount: 0, netAmount: data.salePrice,
          customerIdImage: customerIdImage ?? null,
          idempotencyKey: `pos-cash-${user.id}-${data.motorcycleId}-${Date.now()}`,
          items: { create: { motorcycleId: data.motorcycleId, unitPrice: data.salePrice, discount: 0 } },
        },
      });
      await tx.motorcycle.update({ where: { id: data.motorcycleId }, data: { status: 'sold' } });
      return created;
    });
    return { id: order.id, motorcycleId: data.motorcycleId, motorcycle: { ...motorcycle, price: Number(motorcycle.price), costPrice: Number(motorcycle.costPrice) }, customerName: customer.name, customerPhone: customer.phone, customerIdImage, salePrice: data.salePrice, paymentMethod: data.paymentMethod, branchId: order.branchId, createdBy: order.userId, createdAt: order.createdAt.toISOString() };
  }

  // ─────────────────────────────────────────────────────────
  // TASK-004: Reservation Management
  // ─────────────────────────────────────────────────────────

  async getActiveReservations(
    query: POSActiveReservationsQuery,
    user: AuthenticatedUser,
  ): Promise<POSActiveReservation[]> {
    const isSuperAdmin = user.roleName === 'super_admin';
    const branchId = isSuperAdmin ? query.branchId || user.branchId : user.branchId;

    // Branch validation
    if (!isSuperAdmin && branchId !== user.branchId) {
      throw new BadRequestException({
        code: POSErrorCode.BRANCH_SCOPE_VIOLATION,
        message: 'Cannot access other branch reservations',
      });
    }

    const where: any = {
      status: 'active',
      expiresAt: {
        gte: new Date(),
      },
    };

    if (branchId) {
      where.branchId = branchId;
    }

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    // Filter by expiring soon
    if (query.expiringInDays !== undefined) {
      const expiringDate = new Date();
      expiringDate.setDate(expiringDate.getDate() + query.expiringInDays);
      where.expiresAt = {
        gte: new Date(),
        lte: expiringDate,
      };
    }

    const reservations = await this.prisma.desktopReservation.findMany({
      where,
      orderBy: {
        expiresAt: 'asc',
      },
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
                nameEn: true,
              },
            },
          },
        },
      },
    });

    const now = new Date();
    return reservations.map((res) => {
      const expiresAt = res.expiresAt ? new Date(res.expiresAt) : new Date();
      const expiresInDays = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      return {
        id: res.id,
        reservationNumber: res.reservationNumber,
        customer: {
          id: res.customer.id,
          name: res.customer.name,
          phone: res.customer.phone,
        },
        motorcycle: {
          id: res.motorcycle.id,
          vin: res.motorcycle.vin,
          model: res.motorcycle.model,
          brand: res.motorcycle.brand.nameEn,
        },
        depositAmount: Number(res.paidAmount),
        totalAmount: Number(res.totalPrice),
        remainingAmount: Number(res.remainingAmount),
        expiresAt: res.expiresAt?.toISOString() || '',
        expiresInDays,
        isExpiringSoon: expiresInDays <= 3,
        createdAt: res.createdAt.toISOString(),
      };
    });
  }

  async listDesktopOrders(query: any, user: AuthenticatedUser) {
    const where: any = { branchId: user.roleName === 'super_admin' ? query.branchId : user.branchId };
    if (user.roleName === 'cashier') where.userId = user.id;
    if (query.status) where.status = query.status;
    if (query.paymentType) where.paymentType = query.paymentType;
    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { customer: { name: { contains: query.search, mode: 'insensitive' } } },
        { items: { some: { motorcycle: { vin: { contains: query.search, mode: 'insensitive' } } } } },
      ];
    }
    const page = Number(query.page || 1);
    const limit = Math.min(Number(query.limit || 25), 100);
    const [items, total] = await Promise.all([
      this.prisma.desktopOrder.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { customer: true, branch: true, _count: { select: { items: true } } },
      }),
      this.prisma.desktopOrder.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        orderNumber: item.orderNumber,
        customer: { id: item.customer.id, name: item.customer.name, phone: item.customer.phone },
        branch: { id: item.branch.id, nameAr: item.branch.nameAr, nameEn: item.branch.nameEn },
        status: item.status,
        paymentType: item.paymentType,
        itemCount: item._count.items,
        totalAmount: Number(item.totalAmount),
        discount: Number(item.discount),
        netAmount: Number(item.netAmount),
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createDesktopOrder(data: { customerId: string; motorcycleIds: string[]; discount?: number; address?: string; notes?: string; isDraft?: boolean }, user: AuthenticatedUser) {
    const customer = await this.prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer || !customer.isActive) throw new ConflictException('Customer is inactive or missing');
    const motorcycles = await this.prisma.motorcycle.findMany({ where: { id: { in: data.motorcycleIds } } });
    if (motorcycles.length !== data.motorcycleIds.length) throw new NotFoundException('Motorcycle not found');
    const branchId = user.branchId ?? motorcycles[0].branchId;
    if (!user.branchId && user.roleName !== 'super_admin') throw new BadRequestException('Branch is required');
    if (motorcycles.some((motorcycle) => motorcycle.branchId !== branchId)) throw new BadRequestException('Motorcycle not in your branch');
    const totalAmount = motorcycles.reduce((sum, motorcycle) => sum + Number(motorcycle.price), 0);
    const discount = data.discount || 0;
    const order = await this.prisma.$transaction(async (tx) => {
      for (const motorcycle of motorcycles) {
        const locked = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM "Motorcycle" WHERE id = ${motorcycle.id}::uuid FOR UPDATE`;
        if (!data.isDraft && locked[0]?.status !== 'available') throw new ConflictException('Motorcycle is not available');
      }
      const created = await tx.desktopOrder.create({
        data: {
          orderNumber: `DORD-${branchId.substring(0, 8)}-${Date.now()}`,
          customerId: data.customerId, branchId, userId: user.id,
          status: data.isDraft ? 'draft' : 'confirmed', paymentType: 'INSTALLMENT', totalAmount, discount, netAmount: totalAmount - discount,
          address: data.address, notes: data.notes, idempotencyKey: `pos-order-${user.id}-${Date.now()}`,
          items: { create: motorcycles.map((motorcycle) => ({ motorcycleId: motorcycle.id, unitPrice: motorcycle.price, discount: motorcycles.length === 1 ? discount : 0 })) },
        },
      });
      if (!data.isDraft) await tx.motorcycle.updateMany({ where: { id: { in: data.motorcycleIds } }, data: { status: 'sold' } });
      return created;
    });
    return this.getDesktopOrder(order.id, user);
  }

  async getDesktopOrder(id: string, user: AuthenticatedUser) {
    const order = await this.prisma.desktopOrder.findFirst({
      where: { id, ...(user.roleName === 'super_admin' ? {} : { branchId: user.branchId ?? '' }) },
      include: { customer: true, branch: true, user: true, items: { include: { motorcycle: { include: { brand: true, category: true } } } } },
    }) as any;
    if (!order) throw new NotFoundException('Desktop order not found');
    return {
      ...order,
      customerIdImage: order.customerIdImage ?? null,
      totalAmount: Number(order.totalAmount), discount: Number(order.discount), netAmount: Number(order.netAmount),
      createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((item: any) => ({
        id: item.id, orderId: item.orderId, motorcycleId: item.motorcycleId, unitPrice: Number(item.unitPrice), discount: Number(item.discount),
        motorcycle: { ...item.motorcycle, price: Number(item.motorcycle.price), costPrice: Number(item.motorcycle.costPrice), currentStatus: item.motorcycle.status },
      })),
    };
  }

  async updateDesktopOrderStatus(id: string, status: any, user: AuthenticatedUser) {
    const order = await this.getDesktopOrder(id, user);
    if (status === 'confirmed' && order.status === 'draft') {
      return this.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          const locked = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM "Motorcycle" WHERE id = ${item.motorcycleId}::uuid FOR UPDATE`;
          if (locked[0]?.status !== 'available') throw new ConflictException('Motorcycle is not available');
        }
        await tx.motorcycle.updateMany({ where: { id: { in: order.items.map((item: any) => item.motorcycleId) } }, data: { status: 'sold' } });
        await tx.desktopOrder.update({ where: { id }, data: { status: 'confirmed' } });
        return this.getDesktopOrder(id, user);
      });
    }
    await this.prisma.desktopOrder.update({ where: { id }, data: { status } });
    return this.getDesktopOrder(id, user);
  }

  async cancelDesktopOrder(id: string, user: AuthenticatedUser) {
    const order = await this.getDesktopOrder(id, user);
    return this.prisma.$transaction(async (tx) => {
      await tx.desktopOrder.update({ where: { id }, data: { status: 'cancelled' } });
      for (const item of order.items) {
        await tx.motorcycle.update({ where: { id: item.motorcycleId }, data: { status: 'available' } });
      }
      return this.getDesktopOrder(id, user);
    });
  }

  async listDesktopReservations(query: any, user: AuthenticatedUser) {
    const where: any = { branchId: user.roleName === 'super_admin' ? query.branchId : user.branchId };
    if (query.status) where.status = query.status;
    const page = Math.max(Number(query.page || 1), 1);
    const limit = Math.min(Math.max(Number(query.limit || 25), 1), 100);
    const [items, total] = await Promise.all([
      this.prisma.desktopReservation.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: { customer: true, branch: true, motorcycle: { include: { brand: true } } },
      }),
      this.prisma.desktopReservation.count({ where }),
    ]);
    return { items: items.map((item) => ({
      id: item.id, reservationNumber: item.reservationNumber,
      customer: { id: item.customer.id, name: item.customer.name, phone: item.customer.phone },
      motorcycle: { id: item.motorcycle.id, vin: item.motorcycle.vin, model: item.motorcycle.model, year: item.motorcycle.year, color: item.motorcycle.color, brand: { nameEn: item.motorcycle.brand.nameEn, nameAr: item.motorcycle.brand.nameAr } },
      branch: { id: item.branch.id, nameEn: item.branch.nameEn, nameAr: item.branch.nameAr }, status: item.status,
      source: 'pos', totalPrice: Number(item.totalPrice), depositAmount: Number(item.paidAmount), remainingAmount: Number(item.remainingAmount),
      expiresAt: item.expiresAt?.toISOString(), createdAt: item.createdAt.toISOString(),
    })), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getDesktopReservation(id: string, user: AuthenticatedUser) {
    const reservation = await this.prisma.desktopReservation.findFirst({
      where: { id, ...(user.roleName === 'super_admin' ? {} : { branchId: user.branchId ?? '' }) },
      include: { customer: true, branch: true, user: true, motorcycle: { include: { brand: true } }, convertedOrder: true },
    }) as any;
    if (!reservation) throw new NotFoundException('Desktop reservation not found');
    return {
      ...reservation, source: 'pos', customerIdImage: reservation.customerIdImage ?? null, totalPrice: Number(reservation.totalPrice), depositAmount: Number(reservation.paidAmount), remainingAmount: Number(reservation.remainingAmount),
      createdAt: reservation.createdAt.toISOString(), updatedAt: reservation.updatedAt.toISOString(), expiresAt: reservation.expiresAt?.toISOString(),
      motorcycle: { ...reservation.motorcycle, price: Number(reservation.motorcycle.price), costPrice: Number(reservation.motorcycle.costPrice), brand: { nameEn: reservation.motorcycle.brand.nameEn, nameAr: reservation.motorcycle.brand.nameAr } },
      convertedOrder: reservation.convertedOrder ? { id: reservation.convertedOrder.id, orderNumber: reservation.convertedOrder.orderNumber, status: reservation.convertedOrder.status } : null,
      pricingSnapshot: { basePrice: Number(reservation.totalPrice), vat: 0, discount: 0, totalPrice: Number(reservation.totalPrice) },
    };
  }

  async updateDesktopReservation(id: string, data: { expiresAt?: string; notes?: string }, user: AuthenticatedUser) {
    await this.getDesktopReservation(id, user);
    await this.prisma.desktopReservation.update({ where: { id }, data: { expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined, notes: data.notes } });
    return this.getDesktopReservation(id, user);
  }

  async cancelDesktopReservation(id: string, user: AuthenticatedUser) {
    const reservation = await this.getDesktopReservation(id, user);
    if (reservation.status !== 'active') throw new ConflictException('Reservation is not active');
    return this.prisma.$transaction(async (tx) => {
      await tx.desktopReservation.update({ where: { id }, data: { status: 'cancelled' } });
      await tx.motorcycle.update({ where: { id: reservation.motorcycleId }, data: { status: 'available' } });
      return this.getDesktopReservation(id, user);
    });
  }

  async convertReservation(
    id: string,
    dto: ConvertPOSReservationDto,
    user: AuthenticatedUser,
  ): Promise<CreatePOSTransactionResponse> {
    // Validate reservation exists and is active
    const reservation = await this.prisma.desktopReservation.findUnique({
      where: { id },
      include: {
        customer: true,
        motorcycle: {
          include: {
            brand: true,
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

    if (reservation.status !== 'active') {
      throw new ConflictException({
        code: POSErrorCode.RESERVATION_NOT_ACTIVE,
        message: 'Reservation is not active',
      });
    }

    // Check expiration
    if (reservation.expiresAt && new Date() > reservation.expiresAt) {
      throw new ConflictException({
        code: POSErrorCode.RESERVATION_NOT_ACTIVE,
        message: 'Reservation has expired',
      });
    }

    // Branch validation
    const isSuperAdmin = user.roleName === 'super_admin';
    if (!isSuperAdmin && reservation.branchId !== user.branchId) {
      throw new BadRequestException({
        code: POSErrorCode.BRANCH_SCOPE_VIOLATION,
        message: 'Cannot convert reservation from another branch',
      });
    }

    const branch = await this.prisma.branch.findUnique({ where: { id: reservation.branchId } });
    if (!branch) throw new NotFoundException('Branch not found');
    const order = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM "Motorcycle" WHERE id = ${reservation.motorcycleId}::uuid FOR UPDATE
      `;
      if (!locked[0] || locked[0].status !== 'reserved') {
        throw new ConflictException({ code: POSErrorCode.MOTORCYCLE_NOT_AVAILABLE, message: 'Reserved motorcycle is not available' });
      }
      const created = await tx.desktopOrder.create({
        data: {
          orderNumber: `DORD-${branch.nameEn.substring(0, 3).toUpperCase()}-${Date.now()}`,
          customerId: reservation.customerId,
          branchId: reservation.branchId,
          userId: user.id,
          status: 'completed', paymentType: 'INSTALLMENT',
          totalAmount: reservation.totalPrice,
          discount: 0,
          netAmount: reservation.totalPrice,
          notes: dto.notes,
          idempotencyKey: `pos-convert-${id}-${Date.now()}`,
          items: { create: { motorcycleId: reservation.motorcycleId, unitPrice: reservation.totalPrice, discount: 0 } },
        },
      });
      await tx.motorcycle.update({ where: { id: reservation.motorcycleId }, data: { status: 'sold' } });
      await tx.desktopReservation.update({ where: { id }, data: { status: 'converted', convertedOrderId: created.id } });
      return created;
    });

    await this.auditService.log({
      userId: user.id,
      action: 'pos_reservation_converted',
      entityType: 'desktop_reservation',
      entityId: id,
      after: { orderId: order.id },
    });

    return {
      id: order.id,
      type: 'order',
      number: order.orderNumber,
      customer: { id: reservation.customer.id, name: reservation.customer.name, phone: reservation.customer.phone },
      motorcycle: {
        id: reservation.motorcycle.id,
        vin: reservation.motorcycle.vin,
        model: reservation.motorcycle.model,
        brand: { nameAr: reservation.motorcycle.brand.nameAr, nameEn: reservation.motorcycle.brand.nameEn },
      },
      totalAmount: Number(order.totalAmount),
      discount: 0,
      netAmount: Number(order.netAmount),
      createdAt: order.createdAt.toISOString(),
    };
  }
}

