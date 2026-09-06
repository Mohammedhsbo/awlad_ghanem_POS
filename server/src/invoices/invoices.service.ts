import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  CreateInvoiceRequest,
  UpdateInvoiceRequest,
  InvoiceStatus,
} from "@motorcycle-system/shared-types";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { generateInvoiceNumber, withUniqueRetry } from "../utils/number-generator.js";
import {
  calculateRemainingAmount,
  determineInvoiceStatus,
  isInvoiceEditable,
  isInvoiceCancellable,
  validateInvoiceInvariants,
} from "../utils/financial.js";

@Injectable()
export class InvoicesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  /**
   * Create a new invoice
   */
  async create(
    data: CreateInvoiceRequest,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    const branchId = data.branchId ?? userBranchId;

    if (!branchId) {
      throw new BadRequestException({
        code: "MISSING_BRANCH",
        message: "Branch ID is required",
      });
    }

    // Branch scope validation
    if (!isSuperAdmin && branchId !== userBranchId) {
      throw new ForbiddenException({
        code: "BRANCH_ACCESS_VIOLATION",
        message: "You can only create invoices for your own branch",
      });
    }

    // Validate customer exists
    const customer = await this.prisma.customer.findUnique({
      where: { id: data.customerId },
    });

    if (!customer) {
      throw new NotFoundException({
        code: "CUSTOMER_NOT_FOUND",
        message: "Customer not found",
      });
    }

    // Validate order/reservation if provided
    if (data.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: data.orderId },
        include: { invoice: true },
      });

      if (!order) {
        throw new NotFoundException({
          code: "ORDER_NOT_FOUND",
          message: "Order not found",
        });
      }

      if (order.invoice) {
        throw new ConflictException({
          code: "INVOICE_ALREADY_EXISTS",
          message: "Invoice already exists for this order",
        });
      }
    }

    if (data.reservationId) {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: data.reservationId },
        include: { invoice: true },
      });

      if (!reservation) {
        throw new NotFoundException({
          code: "RESERVATION_NOT_FOUND",
          message: "Reservation not found",
        });
      }

      if (reservation.invoice) {
        throw new ConflictException({
          code: "INVOICE_ALREADY_EXISTS",
          message: "Invoice already exists for this reservation",
        });
      }
    }

    // Validate motorcycles
    const motorcycleIds = data.items.map((item) => item.motorcycleId);
    const motorcycles = await this.prisma.motorcycle.findMany({
      where: { id: { in: motorcycleIds } },
      include: { brand: true, category: true },
    });

    if (motorcycles.length !== motorcycleIds.length) {
      throw new BadRequestException({
        code: "INVALID_MOTORCYCLES",
        message: "One or more motorcycles not found",
      });
    }

    // Get branch details for invoice numbering
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException({
        code: "BRANCH_NOT_FOUND",
        message: "Branch not found",
      });
    }

    const branchCode = branch.nameEn.substring(0, 3).toUpperCase();

    // Calculate totals
    const itemsWithTotals = data.items.map((item) => {
      const totalPrice = item.unitPrice * item.quantity - item.discount;
      return {
        ...item,
        totalPrice: Number(totalPrice.toFixed(2)),
      };
    });

    const totalAmount = itemsWithTotals.reduce(
      (sum, item) => sum + item.totalPrice,
      0
    );

    const remainingAmount = calculateRemainingAmount(totalAmount, 0);

    // Create invoice with items in transaction
    return await withUniqueRetry(async () => {
      return await this.prisma.$transaction(async (tx) => {
        const invoiceNumber = await generateInvoiceNumber(
          tx,
          branchCode,
          new Date().getFullYear()
        );

        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            customerId: data.customerId,
            orderId: data.orderId,
            reservationId: data.reservationId,
            branchId,
            userId,
            status: InvoiceStatus.DRAFT,
            totalAmount,
            paidAmount: 0,
            remainingAmount,
            address: data.address || null,
            issueDate: null,
            dueDate: data.dueDate || null,
            notes: data.notes || null,
            items: {
              create: itemsWithTotals.map((item) => ({
                motorcycleId: item.motorcycleId,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discount: item.discount,
                totalPrice: item.totalPrice,
              })),
            },
          },
          include: {
            items: {
              include: {
                motorcycle: {
                  include: {
                    brand: true,
                    category: true,
                  },
                },
              },
            },
            customer: true,
            branch: true,
            user: true,
          },
        });

        // Audit log
        await this.audit.log({
          userId,
          action: "create",
          entityType: "invoice",
          entityId: invoice.id,
          branchId,
          after: invoice,
        });

        return invoice;
      });
    });
  }

  /**
   * Get invoice by ID
   */
  async findById(
    id: string,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
    isCustomer: boolean,
    customerId?: string
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            motorcycle: {
              include: {
                brand: true,
                category: true,
              },
            },
          },
        },
        customer: true,
        branch: true,
        user: true,
        order: true,
        reservation: true,
        payments: {
          include: {
            allocations: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException({
        code: "INVOICE_NOT_FOUND",
        message: "Invoice not found",
      });
    }

    // Authorization
    if (isCustomer) {
      if (invoice.customerId !== customerId) {
        throw new ForbiddenException({
          code: "INVOICE_NOT_FOUND",
          message: "Invoice not found",
        });
      }
    } else if (!isSuperAdmin && invoice.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: "BRANCH_ACCESS_VIOLATION",
        message: "You can only access invoices from your own branch",
      });
    }

    return invoice;
  }

  /**
   * List invoices with filters and pagination
   */
  async list(
    filters: {
      customerId?: string;
      orderId?: string;
      reservationId?: string;
      status?: InvoiceStatus;
      branchId?: string;
      fromDate?: Date;
      toDate?: Date;
      search?: string;
      page?: number;
      limit?: number;
    },
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
    isCustomer: boolean,
    customerId?: string
  ) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {};

    // Authorization filters
    if (isCustomer) {
      where.customerId = customerId;
    } else if (!isSuperAdmin) {
      where.branchId = userBranchId || undefined;
    }

    // Apply filters
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.orderId) where.orderId = filters.orderId;
    if (filters.reservationId) where.reservationId = filters.reservationId;
    if (filters.status) where.status = filters.status;
    if (filters.branchId && isSuperAdmin) where.branchId = filters.branchId;

    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = filters.fromDate;
      if (filters.toDate) where.createdAt.lte = filters.toDate;
    }

    if (filters.search) {
      where.OR = [
        { invoiceNumber: { contains: filters.search, mode: "insensitive" } },
        { customer: { name: { contains: filters.search, mode: "insensitive" } } },
      ];
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          customer: true,
          branch: true,
          items: {
            select: {
              id: true,
              motorcycleId: true,
              description: true,
              totalPrice: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      items: invoices,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update invoice (only draft invoices can be updated)
   */
  async update(
    id: string,
    data: UpdateInvoiceRequest,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      throw new NotFoundException({
        code: "INVOICE_NOT_FOUND",
        message: "Invoice not found",
      });
    }

    // Branch scope
    if (!isSuperAdmin && invoice.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: "BRANCH_ACCESS_VIOLATION",
        message: "You can only update invoices from your own branch",
      });
    }

    // Only draft invoices can be updated
    if (!isInvoiceEditable(invoice.status as InvoiceStatus)) {
      throw new BadRequestException({
        code: "INVALID_INVOICE_STATUS",
        message: "Only draft invoices can be updated",
      });
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        notes: data.notes,
        dueDate: data.dueDate,
      },
      include: {
        items: {
          include: {
            motorcycle: {
              include: {
                brand: true,
                category: true,
              },
            },
          },
        },
        customer: true,
        branch: true,
        user: true,
      },
    });

    // Audit log
    await this.audit.log({
      userId,
      action: "update",
      entityType: "invoice",
      entityId: id,
      branchId: invoice.branchId,
      before: invoice,
      after: updated,
    });

    return updated;
  }

  /**
   * Issue an invoice (draft → issued)
   */
  async issue(
    id: string,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      throw new NotFoundException({
        code: "INVOICE_NOT_FOUND",
        message: "Invoice not found",
      });
    }

    // Branch scope
    if (!isSuperAdmin && invoice.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: "BRANCH_ACCESS_VIOLATION",
        message: "You can only issue invoices from your own branch",
      });
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException({
        code: "INVALID_INVOICE_STATUS",
        message: "Only draft invoices can be issued",
      });
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.ISSUED,
        issueDate: new Date(),
      },
      include: {
        items: {
          include: {
            motorcycle: {
              include: {
                brand: true,
                category: true,
              },
            },
          },
        },
        customer: true,
        branch: true,
        user: true,
      },
    });

    // Audit log
    await this.audit.log({
      userId,
      action: "issue",
      entityType: "invoice",
      entityId: id,
      branchId: invoice.branchId,
      before: invoice,
      after: updated,
    });

    return updated;
  }

  /**
   * Cancel invoice
   */
  async cancel(
    id: string,
    reason: string,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      throw new NotFoundException({
        code: "INVOICE_NOT_FOUND",
        message: "Invoice not found",
      });
    }

    // Branch scope
    if (!isSuperAdmin && invoice.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: "BRANCH_ACCESS_VIOLATION",
        message: "You can only cancel invoices from your own branch",
      });
    }

    const paidAmount = Number(invoice.paidAmount);

    if (!isInvoiceCancellable(invoice.status as InvoiceStatus, paidAmount)) {
      throw new BadRequestException({
        code: "INVALID_INVOICE_STATUS",
        message: "Invoice cannot be cancelled after payment has been made",
      });
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.CANCELLED,
        notes: invoice.notes
          ? `${invoice.notes}\n\nCancelled: ${reason}`
          : `Cancelled: ${reason}`,
      },
      include: {
        items: {
          include: {
            motorcycle: {
              include: {
                brand: true,
                category: true,
              },
            },
          },
        },
        customer: true,
        branch: true,
        user: true,
      },
    });

    // Audit log
    await this.audit.log({
      userId,
      action: "cancel",
      entityType: "invoice",
      entityId: id,
      branchId: invoice.branchId,
      before: invoice,
      after: updated,
    });

    return updated;
  }
}
