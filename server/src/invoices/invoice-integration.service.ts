import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import {
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
} from "@motorcycle-system/shared-types";
import {
  generateInvoiceNumber,
  generatePaymentReference,
  withUniqueRetry,
} from "../utils/number-generator.js";
import {
  allocatePaymentToInvoice,
} from "../utils/financial.js";

/**
 * TASK-009 & TASK-010: Integration service for reservations and orders
 * Handles automatic invoice generation and deposit conversion
 */
@Injectable()
export class InvoiceIntegrationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  /**
   * TASK-009: Convert reservation deposit to payment record
   * Called when reservation is created with a deposit
   * 
   * Requirements:
   * - Create invoice for reservation
   * - Create payment record for deposit
   * - Link to reservation
   * - Prevent duplicate payment
   * - Preserve audit history
   * - Idempotency protection
   */
  async convertReservationDeposit(params: {
    reservationId: string;
    customerId: string;
    branchId: string;
    userId: string;
    totalPrice: number;
    depositAmount: number;
    motorcycleId: string;
    motorcycleDescription: string;
    idempotencyKey: string;
    tx?: Prisma.TransactionClient;
  }) {
    const {
      reservationId,
      customerId,
      branchId,
      userId,
      totalPrice,
      depositAmount,
      motorcycleId,
      motorcycleDescription,
      idempotencyKey,
      tx,
    } = params;

    const prisma = tx || this.prisma;

    // Check for existing invoice to prevent duplication
    const existingInvoice = await prisma.invoice.findFirst({
      where: { reservationId },
    });

    if (existingInvoice) {
      throw new ConflictException({
        code: "INVOICE_ALREADY_EXISTS",
        message: "Invoice already exists for this reservation",
      });
    }

    // Check idempotency key
    const existingPayment = await prisma.payment.findUnique({
      where: { idempotencyKey },
    });

    if (existingPayment) {
      // Return existing payment and invoice
      const invoice = existingPayment.invoiceId
        ? await prisma.invoice.findUnique({
            where: { id: existingPayment.invoiceId },
            include: {
              items: true,
              payments: true,
            },
          })
        : null;

      return {
        invoice,
        payment: existingPayment,
        isNew: false,
      };
    }

    // Get branch details for invoice numbering
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException({
        code: "BRANCH_NOT_FOUND",
        message: "Branch not found",
      });
    }

    const branchCode = branch.nameEn.substring(0, 3).toUpperCase();
    const invoiceNumber = await generateInvoiceNumber(
      prisma,
      branchCode,
      new Date().getFullYear()
    );

    const remainingAmount = totalPrice - depositAmount;

    // Create invoice
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId,
        reservationId,
        branchId,
        userId,
        status: depositAmount >= totalPrice 
          ? InvoiceStatus.PAID 
          : InvoiceStatus.PARTIALLY_PAID,
        totalAmount: totalPrice,
        paidAmount: depositAmount,
        remainingAmount,
        issueDate: new Date(),
        notes: "Generated from reservation deposit",
        items: {
          create: {
            motorcycleId,
            description: motorcycleDescription,
            quantity: 1,
            unitPrice: totalPrice,
            discount: 0,
            totalPrice,
          },
        },
      },
      include: {
        items: true,
      },
    });

    // Create payment record for deposit
    const paymentReference = await generatePaymentReference();

    const payment = await prisma.payment.create({
      data: {
        paymentReference,
        invoiceId: invoice.id,
        customerId,
        branchId,
        userId,
        amount: depositAmount,
        method: PaymentMethod.CASH, // Default, can be updated
        status: PaymentStatus.COMPLETED,
        idempotencyKey,
        confirmedAt: new Date(),
        notes: "Reservation deposit",
      },
    });

    // Create payment allocation
    await prisma.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        amount: depositAmount,
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

    await this.audit.log({
      userId,
      action: "create",
      entityType: "payment",
      entityId: payment.id,
      branchId,
      after: payment,
    });

    return {
      invoice,
      payment,
      isNew: true,
    };
  }

  /**
   * TASK-010: Generate invoice from order
   * Called after order is created or confirmed
   * 
   * Requirements:
   * - Create invoice with order financial snapshot
   * - Link invoice items to order items
   * - Preserve historical financial data
   * - One invoice per order
   * - Handle order discounts
   */
  async generateInvoiceFromOrder(params: {
    orderId: string;
    customerId: string;
    branchId: string;
    userId: string;
    orderItems: Array<{
      motorcycleId: string;
      description: string;
      unitPrice: number;
      discount: number;
    }>;
    totalAmount: number;
    discount: number;
    netAmount: number;
    notes?: string;
    tx?: Prisma.TransactionClient;
  }) {
    const {
      orderId,
      customerId,
      branchId,
      userId,
      orderItems,
      totalAmount,
      discount,
      netAmount,
      notes,
      tx,
    } = params;

    const prisma = tx || this.prisma;

    // Check for existing invoice
    const existingInvoice = await prisma.invoice.findFirst({
      where: { orderId },
    });

    if (existingInvoice) {
      return existingInvoice;
    }

    // Get branch details
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException({
        code: "BRANCH_NOT_FOUND",
        message: "Branch not found",
      });
    }

    const branchCode = branch.nameEn.substring(0, 3).toUpperCase();
    const invoiceNumber = await generateInvoiceNumber(
      prisma,
      branchCode,
      new Date().getFullYear()
    );

    // Create invoice with items
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId,
        orderId,
        branchId,
        userId,
        status: InvoiceStatus.ISSUED,
        totalAmount: netAmount,
        paidAmount: 0,
        remainingAmount: netAmount,
        issueDate: new Date(),
        notes: notes || "Generated from order",
        items: {
          create: orderItems.map((item) => ({
            motorcycleId: item.motorcycleId,
            description: item.description,
            quantity: 1,
            unitPrice: item.unitPrice,
            discount: item.discount,
            totalPrice: item.unitPrice - item.discount,
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
        order: true,
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
  }

  /**
   * TASK-009: Transfer financial history when reservation converts to order
   * 
   * Requirements:
   * - Transfer payment records from reservation invoice to order invoice
   * - Maintain payment allocation integrity
   * - Preserve audit trail
   * - Update invoice statuses correctly
   * - Prevent duplicate transfers
   */
  async transferReservationFinancialsToOrder(params: {
    reservationId: string;
    orderId: string;
    userId: string;
    tx?: Prisma.TransactionClient;
  }) {
    const { reservationId, orderId, userId, tx } = params;

    const prisma = tx || this.prisma;

    // Get reservation invoice
    const reservationInvoice = await prisma.invoice.findFirst({
      where: { reservationId },
      include: {
        payments: {
          include: {
            allocations: true,
          },
        },
      },
    });

    if (!reservationInvoice) {
      // No invoice exists, nothing to transfer
      return null;
    }

    // Get or create order invoice
    let orderInvoice = await prisma.invoice.findFirst({
      where: { orderId },
    });

    if (!orderInvoice) {
      throw new BadRequestException({
        code: "ORDER_INVOICE_NOT_FOUND",
        message: "Order invoice must be created before transferring reservation financials",
      });
    }

    // Transfer payments to order invoice
    const totalPaid = Number(reservationInvoice.paidAmount);

    if (totalPaid > 0) {
      // Update payment invoice references
      await prisma.payment.updateMany({
        where: { invoiceId: reservationInvoice.id },
        data: { invoiceId: orderInvoice.id },
      });

      // Update payment allocations
      await prisma.paymentAllocation.updateMany({
        where: { invoiceId: reservationInvoice.id },
        data: { invoiceId: orderInvoice.id },
      });

      // Update order invoice amounts
      const allocation = allocatePaymentToInvoice(
        {
          totalAmount: Number(orderInvoice.totalAmount),
          paidAmount: 0,
        },
        totalPaid
      );

      orderInvoice = await prisma.invoice.update({
        where: { id: orderInvoice.id },
        data: {
          paidAmount: allocation.newPaidAmount,
          remainingAmount: allocation.newRemainingAmount,
          status: allocation.newStatus,
        },
      });

      // Cancel reservation invoice (financial data transferred)
      await prisma.invoice.update({
        where: { id: reservationInvoice.id },
        data: {
          status: InvoiceStatus.CANCELLED,
          notes: reservationInvoice.notes
            ? `${reservationInvoice.notes}\n\nTransferred to order invoice ${orderInvoice.invoiceNumber}`
            : `Transferred to order invoice ${orderInvoice.invoiceNumber}`,
        },
      });

      // Audit log
      await this.audit.log({
        userId,
        action: "transfer",
        entityType: "invoice",
        entityId: orderInvoice.id,
        branchId: orderInvoice.branchId,
        before: { reservationInvoiceId: reservationInvoice.id },
        after: { orderInvoiceId: orderInvoice.id, transferredAmount: totalPaid },
      });
    }

    return orderInvoice;
  }
}
