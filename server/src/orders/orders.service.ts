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
import { CreateOrderDto, CreateOrderResponse } from '@motorcycle-system/shared-types';
import { generateInvoiceNumber, generateOrderNumber, withUniqueRetry } from '../utils/number-generator.js';
import { SocketGateway } from '../socket/index.js';

type AuditActorRow = {
  user: { id: string; name: string } | null;
  customer: { id: string; name: string } | null;
};

/** Audit rows are authored by a staff user or by a customer; surface whichever it was. */
function auditActor(log: AuditActorRow) {
  const actor = log.user ?? log.customer;
  return { id: actor?.id ?? '', name: actor?.name ?? 'System' };
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(AuditService) private audit: AuditService,
    @Inject(SocketGateway) private socketGateway: SocketGateway,
  ) { }

  /**
   * Create a new order (e-commerce or POS)
   * - Validates customer, branch, and motorcycles
   * - Allocates motorcycles atomically using transaction with row-level locks
   * - Generates unique order number
   * - Snapshots motorcycle prices
   * - Supports draft mode (POS only)
   */
  async create(
    data: CreateOrderDto,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
    isCustomer: boolean = false,
    opts?: {
      tx?: Prisma.TransactionClient;
      skipMotorcycleStatusCheck?: boolean;
      priceOverrides?: Record<string, number | Prisma.Decimal>;
    }
  ): Promise<CreateOrderResponse> {
    if (!isCustomer && !userId) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED',
        message: 'User ID is required',
      });
    }

    // Determine branch ID
    let branchId = data.branchId ?? userBranchId;

    // Validation: Branch scope for staff
    if (!isCustomer && !isSuperAdmin && branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only create orders for your own branch',
      });
    }

    // Validate customer exists and is active
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

    // Validate empty order items
    if (!data.motorcycleIds || data.motorcycleIds.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_ORDER_ITEMS',
        message: 'Order must contain at least one motorcycle',
      });
    }

    // Remove duplicates from motorcycleIds
    const uniqueMotorcycleIds = [...new Set(data.motorcycleIds)];

    // If branch not specified, get it from first motorcycle
    if (!branchId) {
      const firstMoto = await this.prisma.motorcycle.findUnique({
        where: { id: uniqueMotorcycleIds[0] },
        select: { branchId: true },
      });
      if (!firstMoto) {
        throw new NotFoundException({
          code: 'MOTORCYCLE_NOT_FOUND',
          message: 'Motorcycle not found',
        });
      }
      branchId = firstMoto.branchId;
    }

    // Validate branch exists
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

    // Use transaction with retry for unique constraint handling
    return withUniqueRetry(async () => {
      const branchCode = branch.nameEn.substring(0, 3).toUpperCase();
      const orderNumber = await generateOrderNumber(opts?.tx ?? this.prisma, branchCode);

      const runTx = async (tx: Prisma.TransactionClient) => {
        const motorcycles: Array<{
            id: string;
            vin: string;
            model: string;
            year: number;
            color: string | null;
            price: Prisma.Decimal;
            status: string;
            branchId: string;
            brandId: string;
            brand: { id: string; nameAr: string; nameEn: string };
          }> = [];

          // For non-draft orders: Lock and validate motorcycles
          if (!data.isDraft) {
            for (const motorcycleId of uniqueMotorcycleIds) {
              // Lock motorcycle with FOR UPDATE
              const motorcycle = await tx.$queryRaw<Array<any>>`
                SELECT m.id, m.vin, m.model, m.year, m.color, m.price, m.status, m."branchId", m."brandId"
                FROM "Motorcycle" m
                WHERE m.id = ${motorcycleId}::uuid
                FOR UPDATE
              `;

              if (!motorcycle || motorcycle.length === 0) {
                throw new NotFoundException({
                  code: 'MOTORCYCLE_NOT_FOUND',
                  message: `Motorcycle ${motorcycleId} not found`,
                });
              }

              const moto = motorcycle[0];

              if (moto.branchId !== branchId) {
                throw new ConflictException({
                  code: 'MOTORCYCLE_WRONG_BRANCH',
                  message: `Motorcycle ${moto.vin} is not in the order's branch`,
                });
              }

              // Validate motorcycle is available (unless skipped, e.g. for reservation conversion)
              if (!opts?.skipMotorcycleStatusCheck && moto.status !== 'available') {
                throw new ConflictException({
                  code: 'MOTORCYCLE_NOT_AVAILABLE',
                  message: `Motorcycle ${moto.vin} is ${moto.status}, not available`,
                });
              }

              // Get brand info
              const brand = await tx.brand.findUnique({
                where: { id: moto.brandId },
                select: { id: true, nameAr: true, nameEn: true },
              });

              motorcycles.push({
                ...moto,
                brand: brand!,
              });

              // Update motorcycle status to 'sold'
              await tx.motorcycle.update({
                where: { id: motorcycleId },
                data: { status: 'sold' },
              });
            }
          } else {
            // For draft orders: Just validate existence and collect info (no locking)
            for (const motorcycleId of uniqueMotorcycleIds) {
              const moto = await tx.motorcycle.findUnique({
                where: { id: motorcycleId },
                include: {
                  brand: {
                    select: { id: true, nameAr: true, nameEn: true },
                  },
                },
              });

              if (!moto) {
                throw new NotFoundException({
                  code: 'MOTORCYCLE_NOT_FOUND',
                  message: `Motorcycle ${motorcycleId} not found`,
                });
              }

              if (moto.branchId !== branchId) {
                throw new ConflictException({
                  code: 'MOTORCYCLE_WRONG_BRANCH',
                  message: `Motorcycle ${moto.vin} is not in the order's branch`,
                });
              }

              motorcycles.push(moto as any);
            }
          }

          // Calculate totals using override prices if provided
          const totalAmount = motorcycles.reduce(
            (sum, moto) => {
              const priceToUse = opts?.priceOverrides?.[moto.id] ?? moto.price;
              return sum + Number(priceToUse);
            },
            0
          );

          // Validate discount
          const discount = data.discount ?? 0;
          if (discount > totalAmount) {
            throw new BadRequestException({
              code: 'INVALID_DISCOUNT',
              message: 'Discount cannot exceed total amount',
            });
          }

          const netAmount = totalAmount - discount;

          // Capture address at order time (use provided address or customer's default)
          let orderAddress: string | null = null;
          if (data.address) {
            orderAddress = data.address;
          } else if (customer.addresses && customer.addresses.length > 0) {
            const addr = customer.addresses[0];
            orderAddress = `${addr.addressLine}${addr.city ? `, ${addr.city}` : ''}`;
          }

          // Create order
          const order = await tx.order.create({
            data: {
              orderNumber,
              customerId: data.customerId,
              branchId,
              userId: isCustomer ? null : userId,
              status: data.isDraft ? 'draft' : 'confirmed',
              totalAmount,
              discount,
              netAmount,
              address: orderAddress,
              notes: data.notes,
            },
          });

          // Create order items (with price snapshot)
          const orderItems = await Promise.all(
            motorcycles.map((moto) =>
              tx.orderItem.create({
                data: {
                  orderId: order.id,
                  motorcycleId: moto.id,
                  unitPrice: opts?.priceOverrides?.[moto.id] ?? moto.price,
                  discount: 0, // Per-item discount not implemented yet
                },
              })
            )
          );

          // Audit log
          await this.audit.log({
            ...(isCustomer ? { customerId: userId } : { userId: userId ?? null }),
            action: 'order:created',
            entityType: 'order',
            entityId: order.id,
            branchId,
            after: {
              orderNumber: order.orderNumber,
              status: order.status,
              netAmount: order.netAmount,
            },
          });

          // Emit WebSocket event (if gateway has emit method)
          if (this.socketGateway && typeof (this.socketGateway as any).server?.emit === 'function') {
            (this.socketGateway as any).server.emit('order:created', {
              orderId: order.id,
              orderNumber: order.orderNumber,
              customerId: data.customerId,
              branchId,
              status: order.status,
              netAmount,
              motorcycleIds: uniqueMotorcycleIds,
            });
          }

          // Build response
          const response: CreateOrderResponse = {
            id: order.id,
            orderNumber: order.orderNumber,
            customer: {
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
            },
            branch: {
              id: branch.id,
              nameAr: branch.nameAr,
              nameEn: branch.nameEn,
            },
            user: isCustomer ? null : {
              id: userId!,
              name: 'Staff', // We'd need to query user for actual name
            },
            status: order.status as any,
            items: orderItems.map((item: any, index: number) => ({
              id: item.id,
              motorcycle: {
                id: motorcycles[index].id,
                vin: motorcycles[index].vin,
                model: motorcycles[index].model,
                brand: motorcycles[index].brand,
              },
              unitPrice: Number(item.unitPrice),
              discount: Number(item.discount),
            })),
            totalAmount: Number(order.totalAmount),
            discount: Number(order.discount),
            netAmount: Number(order.netAmount),
            notes: order.notes,
            createdAt: order.createdAt.toISOString(),
          };

          return response;
      };

      if (opts?.tx) {
        return runTx(opts.tx);
      }

      return this.prisma.$transaction(runTx, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000,
      });
    });
  }

  /**
   * Confirm a draft order - allocates motorcycles atomically
   */
  async confirm(
    orderId: string,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ): Promise<{ id: string; orderNumber: string; status: string; netAmount: number; updatedAt: string }> {
    // Get order with items
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            motorcycle: {
              select: { id: true, vin: true, status: true, branchId: true },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }

    // Branch scope validation
    if (!isSuperAdmin && order.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only confirm orders for your own branch',
      });
    }

    // Validate order is draft
    if (order.status !== 'draft') {
      throw new ConflictException({
        code: 'ORDER_NOT_DRAFT',
        message: 'Order is not in draft status',
      });
    }

    // Confirm with transaction (allocate motorcycles)
    return withUniqueRetry(async () => {
      return this.prisma.$transaction(
        async (tx) => {
          // Lock and validate all motorcycles
          for (const item of order.items) {
            const motorcycle = await tx.$queryRaw<Array<any>>`
              SELECT m.id, m.vin, m.status, m."branchId"
              FROM "Motorcycle" m
              WHERE m.id = ${item.motorcycleId}::uuid
              FOR UPDATE
            `;

            if (!motorcycle || motorcycle.length === 0) {
              throw new NotFoundException({
                code: 'MOTORCYCLE_NOT_FOUND',
                message: `Motorcycle ${item.motorcycleId} not found`,
              });
            }

            const moto = motorcycle[0];

            // Validate motorcycle is available
            if (moto.status !== 'available') {
              throw new ConflictException({
                code: 'MOTORCYCLE_NOT_AVAILABLE',
                message: `Motorcycle ${moto.vin} is ${moto.status}, not available`,
              });
            }

            // Validate branch match
            if (moto.branchId !== order.branchId) {
              throw new ConflictException({
                code: 'MOTORCYCLE_WRONG_BRANCH',
                message: `Motorcycle ${moto.vin} is not in the order's branch`,
              });
            }

            // Update motorcycle status to 'sold'
            await tx.motorcycle.update({
              where: { id: item.motorcycleId },
              data: { status: 'sold' },
            });
          }

          // Update order status to confirmed
          const updated = await tx.order.update({
            where: { id: orderId },
            data: {
              status: 'confirmed',
              updatedAt: new Date(),
            },
          });

          // Audit log
          await this.audit.log({
            userId,
            action: 'order:confirmed',
            entityType: 'order',
            entityId: orderId,
            branchId: order.branchId,
            before: { status: 'draft' },
            after: { status: 'confirmed' },
          });

          // Emit WebSocket event
          if (this.socketGateway && typeof (this.socketGateway as any).server?.emit === 'function') {
            (this.socketGateway as any).server.emit('order:confirmed', {
              orderId: updated.id,
              orderNumber: updated.orderNumber,
              branchId: updated.branchId,
              status: updated.status,
            });
          }

          return {
            id: updated.id,
            orderNumber: updated.orderNumber,
            status: updated.status,
            netAmount: Number(updated.netAmount),
            updatedAt: updated.updatedAt.toISOString(),
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000,
        }
      );
    });
  }

  /**
   * List orders with pagination, search, and filters
   */
  async findAll(
    query: {
      page?: number;
      limit?: number;
      search?: string;
      customerId?: string;
      branchId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      sort?: string;
      order?: 'asc' | 'desc';
    },
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
    isCustomer: boolean = false,
    customerIdForCustomer?: string
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const sortField = query.sort ?? 'createdAt';
    const sortOrder = query.order ?? 'desc';

    // Build where clause
    const where: any = {};

    // Branch scoping for staff
    if (!isSuperAdmin && !isCustomer && userBranchId) {
      where.branchId = userBranchId;
    }

    // Customer scoping
    if (isCustomer && customerIdForCustomer) {
      where.customerId = customerIdForCustomer;
    }

    // Filters
    if (query.customerId) {
      where.customerId = query.customerId;
    }

    if (query.branchId) {
      // Validate branch scope
      if (!isSuperAdmin && userBranchId && query.branchId !== userBranchId) {
        throw new ForbiddenException({
          code: 'BRANCH_SCOPE_VIOLATION',
          message: 'You can only view orders for your own branch',
        });
      }
      where.branchId = query.branchId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    // Search
    if (query.search) {
      const searchTerm = query.search.trim();
      where.OR = [
        { orderNumber: { contains: searchTerm, mode: 'insensitive' } },
        { customer: { name: { contains: searchTerm, mode: 'insensitive' } } },
        { customer: { phone: { contains: searchTerm } } },
        { items: { some: { motorcycle: { vin: { contains: searchTerm, mode: 'insensitive' } } } } },
      ];
    }

    // Execute queries
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortOrder },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          discount: true,
          netAmount: true,
          createdAt: true,
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          branch: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
            },
          },
          items: {
            select: {
              id: true,
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customer: order.customer,
        branch: order.branch,
        status: order.status,
        itemCount: order.items.length,
        totalAmount: Number(order.totalAmount),
        discount: Number(order.discount),
        netAmount: Number(order.netAmount),
        createdAt: order.createdAt.toISOString(),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single order with full details
   */
  async findOne(
    orderId: string,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
    isCustomer: boolean = false,
    customerIdForCustomer?: string
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
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
        items: {
          include: {
            motorcycle: {
              select: {
                id: true,
                vin: true,
                model: true,
                year: true,
                color: true,
                status: true,
                brand: {
                  select: {
                    id: true,
                    nameAr: true,
                    nameEn: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }

    // Branch scope validation for staff
    if (!isSuperAdmin && !isCustomer && userBranchId && order.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only view orders for your own branch',
      });
    }

    // Customer scope validation
    if (isCustomer && order.customerId !== customerIdForCustomer) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only view your own orders',
      });
    }

    // Get status history from audit log
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'order',
        entityId: orderId,
        action: { in: ['order:created', 'order:confirmed', 'order:status_changed'] },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const statusHistory = auditLogs.map((log) => ({
      status: (log.after as any)?.status ?? order.status,
      changedAt: log.createdAt.toISOString(),
      changedBy: auditActor(log),
      reason: (log.after as any)?.reason,
    }));

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customer: {
        ...order.customer,
        defaultAddress: order.customer.addresses[0] ?? null,
      },
      branch: order.branch,
      user: order.user,
      status: order.status,
      items: order.items.map((item) => ({
        id: item.id,
        motorcycle: {
          ...item.motorcycle,
          currentStatus: item.motorcycle.status,
        },
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
      })),
      totalAmount: Number(order.totalAmount),
      discount: Number(order.discount),
      netAmount: Number(order.netAmount),
      notes: order.notes,
      statusHistory,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  /**
   * TASK-006: Change order status with transition validation
   */
  async changeStatus(
    orderId: string,
    newStatus: string,
    reason: string | undefined,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ): Promise<{ id: string; orderNumber: string; status: string; previousStatus: string; updatedAt: string }> {
    // Import status validation from shared types
    const {
      isValidOrderStatusTransition,
      getMotorcycleStatusForOrderStatus,
      OrderStatus,
    } = await import('@motorcycle-system/shared-types');

    // Get order with items
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          select: {
            motorcycleId: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }

    // Branch scope validation
    if (!isSuperAdmin && order.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only change status for orders in your own branch',
      });
    }

    // Validate status is valid enum
    if (!Object.values(OrderStatus).includes(newStatus as any)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: 'Invalid order status',
      });
    }

    // Validate transition is allowed
    if (!isValidOrderStatusTransition(order.status as any, newStatus as any)) {
      throw new ConflictException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from ${order.status} to ${newStatus}`,
      });
    }

    // Get required motorcycle status for new order status
    const motorcycleStatus = getMotorcycleStatusForOrderStatus(newStatus as any);

    // Execute status change in transaction
    return withUniqueRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          // If motorcycle status needs to change, update all motorcycles
          if (motorcycleStatus) {
            for (const item of order.items) {
              await tx.motorcycle.update({
                where: { id: item.motorcycleId },
                data: { status: motorcycleStatus },
              });
            }
          }

          // Update order status
          const updated = await tx.order.update({
            where: { id: orderId },
            data: {
              status: newStatus as any,
              updatedAt: new Date(),
            },
          });

          if (newStatus === OrderStatus.COMPLETED) {
            const existingInvoice = await tx.invoice.findUnique({ where: { orderId } });
            if (!existingInvoice) {
              const orderItems = await tx.orderItem.findMany({
                where: { orderId },
                include: { motorcycle: { select: { vin: true, model: true, year: true } } },
              });
              const branch = await tx.branch.findUnique({
                where: { id: order.branchId },
                select: { nameEn: true },
              });
              if (!branch) {
                throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Branch not found' });
              }
              const invoiceNumber = await generateInvoiceNumber(
                tx,
                branch.nameEn.substring(0, 3).toUpperCase(),
                new Date().getFullYear(),
              );
              const orderDiscount = Number(order.discount);
              await tx.invoice.create({
                data: {
                  invoiceNumber,
                  customerId: order.customerId,
                  orderId,
                  branchId: order.branchId,
                  userId,
                  status: 'issued',
                  totalAmount: Number(order.netAmount),
                  paidAmount: 0,
                  remainingAmount: Number(order.netAmount),
                  address: order.address,
                  issueDate: new Date(),
                  items: {
                    create: orderItems.map((item, index) => {
                      const discount = index === 0 ? orderDiscount : 0;
                      const unitPrice = Number(item.unitPrice);
                      return {
                        motorcycleId: item.motorcycleId,
                        description: `${item.motorcycle.year} ${item.motorcycle.model} (VIN: ${item.motorcycle.vin})`,
                        quantity: 1,
                        unitPrice,
                        discount,
                        totalPrice: unitPrice - discount,
                      };
                    }),
                  },
                },
              });
            }
          }

          // Audit log
          await this.audit.log({
            userId,
            action: 'order:status_changed',
            entityType: 'order',
            entityId: orderId,
            branchId: order.branchId,
            before: { status: order.status },
            after: { status: newStatus, reason },
          });

          // Emit WebSocket event
          if (this.socketGateway && typeof (this.socketGateway as any).server?.emit === 'function') {
            (this.socketGateway as any).server.emit('order:status_changed', {
              orderId: updated.id,
              orderNumber: updated.orderNumber,
              previousStatus: order.status,
              newStatus: updated.status,
              branchId: updated.branchId,
            });
          }

          // TASK-011: Create letters when status becomes AWAITING_DELIVERY
          if (newStatus === OrderStatus.AWAITING_DELIVERY) {
            // Trigger letter creation asynchronously (don't block status change)
            setImmediate(async () => {
              try {
                const { OrderLetterIntegrationService } = await import('../letters/order-letter-integration.service.js');
                const integrationService = new OrderLetterIntegrationService(this.prisma, null as any);
                await integrationService.createLetterForOrder(orderId, userId);
              } catch (error) {
                console.error(`Failed to create letters for order ${orderId}:`, error);
              }
            });
          }

          return {
            id: updated.id,
            orderNumber: updated.orderNumber,
            status: updated.status,
            previousStatus: order.status,
            updatedAt: updated.updatedAt.toISOString(),
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
   * TASK-007: Update order (draft only)
   */
  async update(
    orderId: string,
    data: {
      customerId?: string;
      motorcycleIds?: string[];
      discount?: number;
      notes?: string;
    },
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    // Get order
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }

    // Branch scope validation
    if (!isSuperAdmin && order.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only update orders in your own branch',
      });
    }

    // Only draft orders can have customer/items/discount changed
    if (order.status !== 'draft' && (data.customerId || data.motorcycleIds || data.discount !== undefined)) {
      throw new ConflictException({
        code: 'ORDER_NOT_DRAFT',
        message: 'Can only change customer, items, or discount for draft orders',
      });
    }

    // Notes can always be updated
    const updateData: any = {};
    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    // For draft orders, allow customer/items/discount changes
    if (order.status === 'draft') {
      if (data.customerId) {
        // Validate customer exists
        const customer = await this.prisma.customer.findUnique({
          where: { id: data.customerId },
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
        updateData.customerId = data.customerId;
      }

      if (data.motorcycleIds) {
        // Validate motorcycles and recalculate totals
        const motorcycles = await this.prisma.motorcycle.findMany({
          where: {
            id: { in: data.motorcycleIds },
            branchId: order.branchId,
          },
        });

        if (motorcycles.length !== data.motorcycleIds.length) {
          throw new NotFoundException({
            code: 'MOTORCYCLE_NOT_FOUND',
            message: 'One or more motorcycles not found or not in branch',
          });
        }

        const totalAmount = motorcycles.reduce(
          (sum, moto) => sum + Number(moto.price),
          0
        );

        const discount = data.discount ?? Number(order.discount);
        if (discount > totalAmount) {
          throw new BadRequestException({
            code: 'INVALID_DISCOUNT',
            message: 'Discount cannot exceed total amount',
          });
        }

        const netAmount = totalAmount - discount;

        updateData.totalAmount = totalAmount;
        updateData.discount = discount;
        updateData.netAmount = netAmount;

        // Delete old items and create new ones
        await this.prisma.orderItem.deleteMany({
          where: { orderId },
        });

        await this.prisma.orderItem.createMany({
          data: motorcycles.map((moto) => ({
            orderId,
            motorcycleId: moto.id,
            unitPrice: moto.price,
            discount: 0,
          })),
        });
      } else if (data.discount !== undefined) {
        // Update discount only
        const totalAmount = Number(order.totalAmount);
        if (data.discount > totalAmount) {
          throw new BadRequestException({
            code: 'INVALID_DISCOUNT',
            message: 'Discount cannot exceed total amount',
          });
        }
        updateData.discount = data.discount;
        updateData.netAmount = totalAmount - data.discount;
      }
    }

    // Update order
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });

    // Audit log
    await this.audit.log({
      userId,
      action: 'order:updated',
      entityType: 'order',
      entityId: orderId,
      branchId: order.branchId,
      before: {
        customerId: order.customerId,
        discount: Number(order.discount),
        notes: order.notes,
      },
      after: {
        customerId: updated.customerId,
        discount: Number(updated.discount),
        notes: updated.notes,
      },
    });

    // Return updated order (reuse findOne)
    return this.findOne(orderId, userId, userBranchId, isSuperAdmin, false, undefined);
  }

  /**
   * TASK-007: Cancel order
   */
  async cancel(
    orderId: string,
    reason: string | undefined,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
    isCustomer: boolean = false
  ) {
    // Get order with items
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          select: {
            motorcycleId: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }

    // Branch scope validation for staff
    if (!isCustomer && !isSuperAdmin && order.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only cancel orders in your own branch',
      });
    }

    // Customer scope validation
    if (isCustomer && order.customerId !== userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only cancel your own orders',
      });
    }

    // Cannot cancel completed orders
    if (order.status === 'completed') {
      throw new ConflictException({
        code: 'ORDER_CANNOT_BE_CANCELLED',
        message: 'Cannot cancel completed orders',
      });
    }

    // Customers can only cancel confirmed orders (before processing)
    if (isCustomer && order.status !== 'confirmed') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Customers can only cancel confirmed orders before processing',
      });
    }

    // Check if payments exist (simplified check - would need payment module)
    // For now, we'll assume no payments if we can't check
    // const paymentsExist = await this.prisma.payment?.count({ where: { orderId } }) ?? 0;
    // if (paymentsExist > 0) {
    //   throw new ConflictException({
    //     code: 'PAYMENTS_EXIST',
    //     message: 'Cannot cancel order with payments. Use refund instead.',
    //   });
    // }

    // Cancel with transaction
    return withUniqueRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          // Update order status to cancelled
          await tx.order.update({
            where: { id: orderId },
            data: {
              status: 'cancelled',
              updatedAt: new Date(),
            },
          });

          // Revert motorcycles to available (if they were allocated)
          if (order.status !== 'draft') {
            for (const item of order.items) {
              await tx.motorcycle.update({
                where: { id: item.motorcycleId },
                data: { status: 'available' },
              });
            }
          }

          // Audit log
          await this.audit.log({
            userId,
            action: 'order:cancelled',
            entityType: 'order',
            entityId: orderId,
            branchId: order.branchId,
            before: { status: order.status },
            after: { status: 'cancelled', reason },
          });

          // TASK-009: Cancel any active financing contracts for this order
          const activeFinancingContracts = await tx.financingContract.findMany({
            where: {
              orderId,
              status: 'active',
            },
          });

          for (const contract of activeFinancingContracts) {
            // Check if any payments have been made on installments
            const installmentsWithPayments = await tx.installment.count({
              where: {
                contractId: contract.id,
                paidAmount: { gt: 0 },
              },
            });

            if (installmentsWithPayments > 0) {
              throw new ConflictException({
                code: 'FINANCING_HAS_PAYMENTS',
                message: 'Cannot cancel order with financing contract that has received payments. Contact branch admin.',
              });
            }

            // Cancel the financing contract
            await tx.financingContract.update({
              where: { id: contract.id },
              data: {
                status: 'cancelled',
              },
            });

            // Update all unpaid installments to cancelled status (if such status exists)
            // For now, we'll leave them as-is since the contract is cancelled
            await this.audit.log({
              userId,
              action: 'financing_contract:auto_cancelled',
              entityType: 'financing_contract',
              entityId: contract.id,
              branchId: order.branchId,
              before: { status: 'active' },
              after: { status: 'cancelled', reason: 'Order cancelled' },
            });
          }

          // Emit WebSocket event
          if (this.socketGateway && typeof (this.socketGateway as any).server?.emit === 'function') {
            (this.socketGateway as any).server.emit('order:cancelled', {
              orderId: order.id,
              orderNumber: order.orderNumber,
              branchId: order.branchId,
              motorcycleIds: order.items.map((i) => i.motorcycleId),
            });
          }
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
   * TASK-008: Get order history (status changes)
   */
  async getHistory(
    orderId: string,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
    isCustomer: boolean = false,
    customerIdForCustomer?: string
  ) {
    // Get order first for permission checks
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        branchId: true,
        customerId: true,
      },
    });

    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }

    // Branch scope validation for staff
    if (!isCustomer && !isSuperAdmin && userBranchId && order.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_VIOLATION',
        message: 'You can only view history for orders in your own branch',
      });
    }

    // Customer scope validation
    if (isCustomer && order.customerId !== customerIdForCustomer) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only view history for your own orders',
      });
    }

    // Get audit logs
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'order',
        entityId: orderId,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        customer: {
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
      before: log.before as any,
      after: log.after as any,
      user: auditActor(log),
      reason: (log.after as any)?.reason,
      createdAt: log.createdAt.toISOString(),
    }));
  }
}
