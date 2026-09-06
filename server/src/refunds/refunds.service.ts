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
  CreateRefundRequest,
  PaymentStatus,
} from "@motorcycle-system/shared-types";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import {
  generateRefundReference,
  withUniqueRetry,
} from "../utils/number-generator.js";
import {
  calculateTotalRefunded,
  validateRefundAmount,
  isPaymentRefundable,
  determinePaymentStatus,
  reversePaymentAllocation,
} from "../utils/financial.js";
import {
  lockPaymentWithRefunds,
  lockInvoiceForUpdate,
  validatePaymentRefundBalance,
  validateNoNegativeAmounts,
  retryOnDeadlock,
  safeAdd,
} from "../utils/financial-transaction-safety.js";

@Injectable()
export class RefundsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  /**
   * Create a new refund
   */
  async create(
    data: CreateRefundRequest,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    // Validate payment exists
    const payment = await this.prisma.payment.findUnique({
      where: { id: data.paymentId },
      include: {
        refunds: true,
        invoice: true,
        allocations: true,
      },
    });

    if (!payment) {
      throw new NotFoundException({
        code: "PAYMENT_NOT_FOUND",
        message: "Payment not found",
      });
    }

    // Branch scope
    if (!isSuperAdmin && payment.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: "BRANCH_ACCESS_VIOLATION",
        message: "You can only create refunds for your own branch",
      });
    }

    // Only completed payments can be refunded
    if (!isPaymentRefundable(payment.status as PaymentStatus)) {
      throw new BadRequestException({
        code: "INVALID_PAYMENT_STATUS",
        message: "Only completed payments can be refunded",
      });
    }

    // Create refund and update payment/invoice in transaction with row-level locking and deadlock retry
    return await retryOnDeadlock(async () => {
      return await withUniqueRetry(async () => {
        return await this.prisma.$transaction(async (tx) => {
          // Lock payment and all existing refunds atomically to prevent concurrent refunds
          const locked = await lockPaymentWithRefunds(tx, data.paymentId);

          if (!locked || !locked.payment) {
            throw new NotFoundException({
              code: "PAYMENT_NOT_FOUND",
              message: "Payment not found during lock acquisition",
            });
          }

          const lockedPayment = locked.payment;
          const lockedRefunds = locked.refunds;

          // Recalculate total refunded from locked data
          const totalRefunded = calculateTotalRefunded(
            lockedRefunds.map((r: { amount: any }) => ({ amount: Number(r.amount) }))
          );

          // Validate refund amount against locked payment data
          const validation = validateRefundAmount(
            data.amount,
            Number(lockedPayment.amount),
            totalRefunded
          );

          if (!validation.valid) {
            throw new BadRequestException({
              code: "REFUND_EXCEEDS_PAYMENT",
              message: validation.error,
            });
          }

          const refundReference = await generateRefundReference();

          // Create refund
          const refund = await tx.refund.create({
            data: {
              refundReference,
              paymentId: data.paymentId,
              amount: data.amount,
              reason: data.reason,
              method: data.method,
              status: "completed",
              processedBy: userId,
              processedAt: new Date(),
              notes: data.notes || null,
            },
            include: {
              payment: {
                include: {
                  invoice: true,
                  customer: true,
                  branch: true,
                },
              },
              processedByUser: true,
            },
          });

          // Calculate new refund total and payment status
          const newTotalRefunded = safeAdd(totalRefunded, data.amount);
          const newPaymentStatus = determinePaymentStatus(
            Number(lockedPayment.amount),
            newTotalRefunded,
            lockedPayment.status as PaymentStatus
          );

          // Validate payment-refund balance integrity before update
          validatePaymentRefundBalance(
            Number(lockedPayment.amount),
            newTotalRefunded
          );

          // Update payment status
          await tx.payment.update({
            where: { id: data.paymentId },
            data: {
              status: newPaymentStatus,
            },
          });

          // Reverse payment allocation from invoice
          if (lockedPayment.invoiceId) {
            // Lock invoice for update
            const lockedInvoice = await lockInvoiceForUpdate(tx, lockedPayment.invoiceId);

            if (lockedInvoice) {
              const reversal = reversePaymentAllocation(
                {
                  totalAmount: Number(lockedInvoice.totalAmount),
                  paidAmount: Number(lockedInvoice.paidAmount),
                },
                data.amount
              );

              // Validate no negative amounts before update
              validateNoNegativeAmounts({
                paidAmount: reversal.newPaidAmount,
                remainingAmount: reversal.newRemainingAmount,
              });

              await tx.invoice.update({
                where: { id: lockedPayment.invoiceId },
                data: {
                  paidAmount: reversal.newPaidAmount,
                  remainingAmount: reversal.newRemainingAmount,
                  status: reversal.newStatus,
                },
              });
            }
          }

          // Audit log
          await this.audit.log({
            userId,
            action: "create",
            entityType: "refund",
            entityId: refund.id,
            branchId: lockedPayment.branchId,
            after: refund,
          });

          return refund;
        });
      });
    });
  }

  /**
   * Get refund by ID
   */
  async findById(
    id: string,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    const refund = await this.prisma.refund.findUnique({
      where: { id },
      include: {
        payment: {
          include: {
            invoice: {
              include: {
                customer: true,
                branch: true,
              },
            },
            customer: true,
            branch: true,
          },
        },
        processedByUser: true,
      },
    });

    if (!refund) {
      throw new NotFoundException({
        code: "REFUND_NOT_FOUND",
        message: "Refund not found",
      });
    }

    // Branch scope
    if (!isSuperAdmin && refund.payment.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: "BRANCH_ACCESS_VIOLATION",
        message: "You can only access refunds from your own branch",
      });
    }

    return refund;
  }

  /**
   * List refunds with filters and pagination
   */
  async list(
    filters: {
      paymentId?: string;
      customerId?: string;
      branchId?: string;
      fromDate?: Date;
      toDate?: Date;
      page?: number;
      limit?: number;
    },
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.RefundWhereInput = {};

    // Branch scope
    if (!isSuperAdmin && userBranchId) {
      where.payment = {
        branchId: userBranchId,
      };
    }

    // Apply filters
    if (filters.paymentId) where.paymentId = filters.paymentId;
    if (filters.customerId) {
      if (where.payment) {
        where.payment.customerId = filters.customerId;
      } else {
        where.payment = {
          customerId: filters.customerId,
        };
      }
    }
    if (filters.branchId && isSuperAdmin) {
      if (where.payment) {
        where.payment.branchId = filters.branchId;
      } else {
        where.payment = {
          branchId: filters.branchId,
        };
      }
    }

    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = filters.fromDate;
      if (filters.toDate) where.createdAt.lte = filters.toDate;
    }

    const [refunds, total] = await Promise.all([
      this.prisma.refund.findMany({
        where,
        include: {
          payment: {
            include: {
              invoice: {
                select: {
                  invoiceNumber: true,
                },
              },
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
                  nameEn: true,
                  nameAr: true,
                },
              },
            },
          },
          processedByUser: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.refund.count({ where }),
    ]);

    return {
      items: refunds,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
