import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  InvoiceStatus,
  PaymentStatus,
} from "@motorcycle-system/shared-types";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class CustomersFinancialService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Get customer invoices with filters
   */
  async getCustomerInvoices(
    customerId: string,
    filters: {
      status?: InvoiceStatus;
      fromDate?: Date;
      toDate?: Date;
      page?: number;
      limit?: number;
    },
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
    isCustomer: boolean,
    requestingCustomerId?: string
  ) {
    // Validate customer exists
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException({
        code: "CUSTOMER_NOT_FOUND",
        message: "Customer not found",
      });
    }

    // Authorization: customer can only access own data
    if (isCustomer && customerId !== requestingCustomerId) {
      throw new ForbiddenException({
        code: "CUSTOMER_NOT_FOUND",
        message: "Customer not found",
      });
    }

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {
      customerId,
    };

    // Branch scope for staff
    if (!isCustomer && !isSuperAdmin) {
      where.branchId = userBranchId || undefined;
    }

    // Apply filters
    if (filters.status) where.status = filters.status;

    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = filters.fromDate;
      if (filters.toDate) where.createdAt.lte = filters.toDate;
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          branch: {
            select: {
              id: true,
              nameEn: true,
              nameAr: true,
            },
          },
          items: {
            include: {
              motorcycle: {
                select: {
                  id: true,
                  vin: true,
                  model: true,
                },
              },
            },
          },
          payments: {
            select: {
              id: true,
              paymentReference: true,
              amount: true,
              method: true,
              status: true,
              createdAt: true,
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
   * Get customer payments with filters
   */
  async getCustomerPayments(
    customerId: string,
    filters: {
      status?: PaymentStatus;
      fromDate?: Date;
      toDate?: Date;
      page?: number;
      limit?: number;
    },
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
    isCustomer: boolean,
    requestingCustomerId?: string
  ) {
    // Validate customer exists
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException({
        code: "CUSTOMER_NOT_FOUND",
        message: "Customer not found",
      });
    }

    // Authorization: customer can only access own data
    if (isCustomer && customerId !== requestingCustomerId) {
      throw new ForbiddenException({
        code: "CUSTOMER_NOT_FOUND",
        message: "Customer not found",
      });
    }

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {
      customerId,
    };

    // Branch scope for staff
    if (!isCustomer && !isSuperAdmin) {
      where.branchId = userBranchId || undefined;
    }

    // Apply filters
    if (filters.status) where.status = filters.status;

    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = filters.fromDate;
      if (filters.toDate) where.createdAt.lte = filters.toDate;
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true,
            },
          },
          branch: {
            select: {
              id: true,
              nameEn: true,
              nameAr: true,
            },
          },
          refunds: {
            select: {
              id: true,
              refundReference: true,
              amount: true,
              reason: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      items: payments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get customer financial summary
   */
  async getCustomerFinancialSummary(
    customerId: string,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean,
    isCustomer: boolean,
    requestingCustomerId?: string
  ) {
    // Validate customer exists
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException({
        code: "CUSTOMER_NOT_FOUND",
        message: "Customer not found",
      });
    }

    // Authorization: customer can only access own data
    if (isCustomer && customerId !== requestingCustomerId) {
      throw new ForbiddenException({
        code: "CUSTOMER_NOT_FOUND",
        message: "Customer not found",
      });
    }

    // Base where clause
    const invoiceWhere: Prisma.InvoiceWhereInput = {
      customerId,
      status: {
        notIn: [InvoiceStatus.CANCELLED, InvoiceStatus.DRAFT],
      },
    };

    const paymentWhere: Prisma.PaymentWhereInput = {
      customerId,
      status: PaymentStatus.COMPLETED,
    };

    // Branch scope for staff
    if (!isCustomer && !isSuperAdmin) {
      invoiceWhere.branchId = userBranchId || undefined;
      paymentWhere.branchId = userBranchId || undefined;
    }

    // Calculate totals
    const [totalOwedResult, totalPaidResult, outstandingResult] = await Promise.all([
      // Total amount from all issued invoices
      this.prisma.invoice.aggregate({
        where: invoiceWhere,
        _sum: {
          totalAmount: true,
        },
      }),
      // Total paid from completed payments
      this.prisma.payment.aggregate({
        where: paymentWhere,
        _sum: {
          amount: true,
        },
      }),
      // Outstanding balance from unpaid/partially paid invoices
      this.prisma.invoice.aggregate({
        where: {
          ...invoiceWhere,
          status: {
            in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID],
          },
        },
        _sum: {
          remainingAmount: true,
        },
      }),
    ]);

    const totalOwed = Number(totalOwedResult._sum.totalAmount || 0);
    const totalPaid = Number(totalPaidResult._sum.amount || 0);
    const outstandingBalance = Number(outstandingResult._sum.remainingAmount || 0);

    // Get invoice counts by status
    const invoiceStatusCounts = await this.prisma.invoice.groupBy({
      by: ["status"],
      where: {
        customerId,
        ...((!isCustomer && !isSuperAdmin) ? { branchId: userBranchId || undefined } : {}),
      },
      _count: {
        id: true,
      },
    });

    const statusCounts = invoiceStatusCounts.reduce(
      (acc: Record<string, number>, item: { status: string; _count: { id: number } }) => {
        acc[item.status] = item._count.id;
        return acc;
      },
      {} as Record<string, number>
    );

    // Recent transactions
    const recentInvoices = await this.prisma.invoice.findMany({
      where: invoiceWhere,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalAmount: true,
        remainingAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const recentPayments = await this.prisma.payment.findMany({
      where: paymentWhere,
      select: {
        id: true,
        paymentReference: true,
        amount: true,
        method: true,
        createdAt: true,
        invoice: {
          select: {
            invoiceNumber: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return {
      summary: {
        totalOwed,
        totalPaid,
        outstandingBalance,
        invoiceStatusCounts: statusCounts,
      },
      recentInvoices,
      recentPayments,
    };
  }
}
