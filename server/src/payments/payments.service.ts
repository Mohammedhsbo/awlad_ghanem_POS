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
  CreatePaymentRequest,
  ConfirmPaymentRequest,
  CancelPaymentRequest,
  PaymentStatus,
  PaymentMethod,
  InvoiceStatus,
} from "@motorcycle-system/shared-types";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import {
  generatePaymentReference,
  withUniqueRetry,
} from "../utils/number-generator.js";
import {
  calculateRemainingAmount,
  calculateCashChange,
  validatePaymentAmount,
  validateCashPayment,
  allocatePaymentToInvoice,
  determineInvoiceStatus,
} from "../utils/financial.js";
import {
  lockInvoiceForUpdate,
  validateInvoiceBalance,
  validateNoNegativeAmounts,
  retryOnDeadlock,
  validateIdempotencyKey,
  safeAdd,
} from "../utils/financial-transaction-safety.js";

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  /**
   * Create a new payment
   * TASK-012: Enhanced with row-level locking and concurrency protection
   */
  async create(
    data: CreatePaymentRequest,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    // Validate idempotency key format
    if (!validateIdempotencyKey(data.idempotencyKey)) {
      throw new BadRequestException({
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "Invalid idempotency key format",
      });
    }

    // Check idempotency key (prevents duplicate payments)
    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      include: {
        invoice: true,
        allocations: true,
      },
    });

    if (existing) {
      // Return existing payment (idempotent behavior)
      await this.audit.log({
        userId,
        action: "duplicate_payment_attempt",
        entityType: "payment",
        entityId: existing.id,
        branchId: existing.branchId,
        after: { idempotencyKey: data.idempotencyKey, result: "returned_existing" },
      });

      return existing;
    }

    // Validate invoice exists (preliminary check, will lock in transaction)
    const invoiceCheck = await this.prisma.invoice.findUnique({
      where: { id: data.invoiceId },
      select: {
        id: true,
        branchId: true,
        customerId: true,
        status: true,
      },
    });

    if (!invoiceCheck) {
      throw new NotFoundException({
        code: "INVOICE_NOT_FOUND",
        message: "Invoice not found",
      });
    }

    // Branch scope
    if (!isSuperAdmin && invoiceCheck.branchId !== userBranchId) {
      throw new ForbiddenException({
        code: "BRANCH_ACCESS_VIOLATION",
        message: "You can only create payments for your own branch",
      });
    }

    // Validate cash payment if applicable
    if (data.method === PaymentMethod.CASH && data.cashDetails) {
      const cashValidation = validateCashPayment(
        data.cashDetails.amountReceived,
        data.amount
      );

      if (!cashValidation.valid) {
        throw new BadRequestException({
          code: "CASH_CALCULATION_ERROR",
          message: cashValidation.error,
        });
      }
    }

    // Create payment with row-level locking and deadlock retry
    return await retryOnDeadlock(async () => {
      return await withUniqueRetry(async () => {
        return await this.prisma.$transaction(async (tx) => {
          // Lock invoice FOR UPDATE to prevent concurrent payments
          const lockedInvoice = await lockInvoiceForUpdate(tx, data.invoiceId);

          // Invoice must be issued or partially paid
          if (
            lockedInvoice.status !== InvoiceStatus.ISSUED &&
            lockedInvoice.status !== InvoiceStatus.PARTIALLY_PAID &&
            lockedInvoice.status !== InvoiceStatus.PAID
          ) {
            throw new BadRequestException({
              code: "INVALID_INVOICE_STATUS",
              message: "Invoice must be issued before payment can be recorded",
            });
          }

          const remainingBalance = Number(lockedInvoice.remainingAmount);

          // Validate payment amount
          const validation = validatePaymentAmount(
            data.amount,
            remainingBalance,
            false // Don't allow overpayment by default
          );

          if (!validation.valid) {
            throw new BadRequestException({
              code: "INVALID_PAYMENT_AMOUNT",
              message: validation.error,
            });
          }

          // Validate invoice balance integrity
          validateInvoiceBalance({
            totalAmount: Number(lockedInvoice.totalAmount),
            paidAmount: Number(lockedInvoice.paidAmount),
            remainingAmount: Number(lockedInvoice.remainingAmount),
          });

          const paymentReference = await generatePaymentReference();

          // Calculate cash change if applicable
          let cashChange = null;
          if (data.method === PaymentMethod.CASH && data.cashDetails) {
            cashChange = calculateCashChange(
              data.cashDetails.amountReceived,
              data.amount
            );
          }

          // Create payment
          const payment = await tx.payment.create({
            data: {
              paymentReference,
              invoiceId: data.invoiceId,
              customerId: lockedInvoice.customerId,
              branchId: lockedInvoice.branchId,
              userId,
              amount: data.amount,
              method: data.method,
              status: PaymentStatus.COMPLETED, // Auto-complete for now
              reference: data.reference || null,
              externalTransactionId: data.externalTransactionId || null,
              providerId: data.providerId || null,
              idempotencyKey: data.idempotencyKey,
              cashAmountReceived: data.cashDetails?.amountReceived || null,
              cashChange,
              confirmedAt: new Date(),
              notes: data.notes || null,
            },
          });

          // Allocate payment to invoice
          await tx.paymentAllocation.create({
            data: {
              paymentId: payment.id,
              invoiceId: data.invoiceId,
              amount: data.amount,
            },
          });

          // Calculate new invoice amounts
          const allocation = allocatePaymentToInvoice(
            {
              totalAmount: Number(lockedInvoice.totalAmount),
              paidAmount: Number(lockedInvoice.paidAmount),
            },
            data.amount
          );

          // Validate no negative amounts
          validateNoNegativeAmounts({
            paidAmount: allocation.newPaidAmount,
            remainingAmount: allocation.newRemainingAmount,
          });

          // Update invoice amounts and status
          const updatedInvoice = await tx.invoice.update({
            where: { id: data.invoiceId },
            data: {
              paidAmount: allocation.newPaidAmount,
              remainingAmount: allocation.newRemainingAmount,
              status: allocation.newStatus,
            },
          });

          // Audit log - payment creation
          await this.audit.log({
            userId,
            action: "create",
            entityType: "payment",
            entityId: payment.id,
            branchId: lockedInvoice.branchId,
            after: {
              paymentReference: payment.paymentReference,
              amount: payment.amount,
              method: payment.method,
              status: payment.status,
              invoiceId: payment.invoiceId,
              idempotencyKey: payment.idempotencyKey,
            },
          });

          // Audit log - invoice update
          await this.audit.log({
            userId,
            action: "payment_applied",
            entityType: "invoice",
            entityId: data.invoiceId,
            branchId: lockedInvoice.branchId,
            before: {
              status: lockedInvoice.status,
              paidAmount: lockedInvoice.paidAmount,
              remainingAmount: lockedInvoice.remainingAmount,
            },
            after: {
              status: updatedInvoice.status,
              paidAmount: updatedInvoice.paidAmount,
              remainingAmount: updatedInvoice.remainingAmount,
              paymentId: payment.id,
            },
          });

          // Fetch full payment with relations for response
          return await tx.payment.findUnique({
            where: { id: payment.id },
            include: {
              invoice: {
                include: {
                  customer: true,
                  branch: true,
                },
              },
              customer: true,
              branch: true,
              user: true,
              allocations: true,
            },
          });
        });
      });
    });
  }

  /**
   * Get payment by ID
   */
  async findById(
    id: string,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: {
          include: {
            customer: true,
            branch: true,
            items: true,
          },
        },
        customer: true,
        branch: true,
        user: true,
        allocations: {
          include: {
            invoice: true,
          },
        },
        refunds: true,
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
        message: "You can only access payments from your own branch",
      });
    }

    return payment;
  }

  /**
   * List payments with filters and pagination
   */
  async list(
    filters: {
      customerId?: string;
      invoiceId?: string;
      status?: PaymentStatus;
      method?: PaymentMethod;
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

    const where: Prisma.PaymentWhereInput = {};

    // Branch scope
    if (!isSuperAdmin) {
      where.branchId = userBranchId || undefined;
    }

    // Apply filters
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.invoiceId) where.invoiceId = filters.invoiceId;
    if (filters.status) where.status = filters.status;
    if (filters.method) where.method = filters.method;
    if (filters.branchId && isSuperAdmin) where.branchId = filters.branchId;

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
   * Confirm pending payment
   */
  async confirm(
    id: string,
    data: ConfirmPaymentRequest,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
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
        message: "You can only confirm payments from your own branch",
      });
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException({
        code: "INVALID_PAYMENT_STATUS",
        message: "Only pending payments can be confirmed",
      });
    }

    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        status: PaymentStatus.COMPLETED,
        externalTransactionId: data.externalTransactionId || payment.externalTransactionId,
        confirmedAt: new Date(),
        notes: data.notes
          ? payment.notes
            ? `${payment.notes}\n${data.notes}`
            : data.notes
          : payment.notes,
      },
      include: {
        invoice: true,
        customer: true,
        branch: true,
        user: true,
        allocations: true,
      },
    });

    // Audit log
    await this.audit.log({
      userId,
      action: "confirm",
      entityType: "payment",
      entityId: id,
      branchId: payment.branchId,
      before: payment,
      after: updated,
    });

    return updated;
  }

  /**
   * Cancel pending payment
   */
  async cancel(
    id: string,
    data: CancelPaymentRequest,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
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
        message: "You can only cancel payments from your own branch",
      });
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException({
        code: "INVALID_PAYMENT_STATUS",
        message: "Only pending payments can be cancelled",
      });
    }

    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        status: PaymentStatus.CANCELLED,
        failedAt: new Date(),
        failureReason: data.reason,
      },
      include: {
        invoice: true,
        customer: true,
        branch: true,
        user: true,
      },
    });

    // Audit log
    await this.audit.log({
      userId,
      action: "cancel",
      entityType: "payment",
      entityId: id,
      branchId: payment.branchId,
      before: payment,
      after: updated,
    });

    return updated;
  }

  /**
   * Get payment allocations
   */
  async getAllocations(
    id: string,
    userId: string,
    userBranchId: string | null,
    isSuperAdmin: boolean
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
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
        message: "You can only access payments from your own branch",
      });
    }

    const allocations = await this.prisma.paymentAllocation.findMany({
      where: { paymentId: id },
      include: {
        invoice: {
          include: {
            customer: true,
          },
        },
      },
    });

    return allocations;
  }
}
