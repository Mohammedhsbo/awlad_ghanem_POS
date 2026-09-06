/**
 * TASK-013: Financial Audit Service
 * 
 * Comprehensive financial audit logging with:
 * - All financial state changes tracked
 * - Immutable audit records
 * - Actor and timestamp tracking
 * - Change detail capture
 * - Sensitive data masking
 * - Failed operation logging
 */

import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

export enum FinancialAuditAction {
  INVOICE_CREATED = "invoice.created",
  INVOICE_ISSUED = "invoice.issued",
  INVOICE_CANCELLED = "invoice.cancelled",
  INVOICE_STATUS_CHANGED = "invoice.status_changed",
  INVOICE_UPDATED = "invoice.updated",

  PAYMENT_CREATED = "payment.created",
  PAYMENT_CONFIRMED = "payment.confirmed",
  PAYMENT_CANCELLED = "payment.cancelled",
  PAYMENT_FAILED = "payment.failed",
  PAYMENT_STATUS_CHANGED = "payment.status_changed",
  PAYMENT_APPLIED_TO_INVOICE = "payment.applied_to_invoice",
  PAYMENT_DUPLICATE_ATTEMPTED = "payment.duplicate_attempted",

  PAYMENT_ALLOCATION_CREATED = "payment_allocation.created",
  PAYMENT_ALLOCATION_REVERSED = "payment_allocation.reversed",

  REFUND_CREATED = "refund.created",
  REFUND_COMPLETED = "refund.completed",
  REFUND_FAILED = "refund.failed",
  REFUND_CANCELLED = "refund.cancelled",
  REFUND_APPLIED_TO_PAYMENT = "refund.applied_to_payment",
  REFUND_APPLIED_TO_INVOICE = "refund.applied_to_invoice",

  WEBHOOK_RECEIVED = "webhook.received",
  WEBHOOK_PROCESSED = "webhook.processed",
  WEBHOOK_REJECTED = "webhook.rejected",
  WEBHOOK_DUPLICATE = "webhook.duplicate",

  FINANCIAL_RECONCILIATION = "financial.reconciliation",
  BALANCE_INTEGRITY_CHECK = "balance.integrity_check",
  BALANCE_INTEGRITY_FAILURE = "balance.integrity_failure",

  CONCURRENT_OPERATION_CONFLICT = "concurrent.operation_conflict",
  DEADLOCK_RETRY = "deadlock.retry",
  IDEMPOTENCY_KEY_USED = "idempotency.key_used",
}

interface FinancialAuditEntry {
  /** Null for automated operations that have no human actor. */
  userId: string | null;
  action: FinancialAuditAction | string;
  entityType: string;
  entityId: string;
  branchId?: string | null;
  before?: any;
  after?: any;
  metadata?: Record<string, any>;
  errorDetails?: string;
  requestId?: string;
  ipAddress?: string;
}

@Injectable()
export class FinancialAuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Log financial audit entry
   * All entries are immutable after creation
   */
  async log(entry: FinancialAuditEntry): Promise<void> {
    try {
      // Mask sensitive data before logging
      const sanitizedBefore = this.maskSensitiveData(entry.before);
      const sanitizedAfter = this.maskSensitiveData(entry.after);

      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          branchId: entry.branchId ?? null,
          before: sanitizedBefore,
          after: sanitizedAfter,
        },
      });
    } catch (error) {
      // Never let audit logging failure break the main operation
      console.error("Failed to log financial audit:", error);
    }
  }

  /**
   * Log invoice creation
   */
  async logInvoiceCreated(params: {
    userId: string;
    invoiceId: string;
    branchId: string;
    invoice: any;
    requestId?: string;
  }): Promise<void> {
    await this.log({
      userId: params.userId,
      action: FinancialAuditAction.INVOICE_CREATED,
      entityType: "invoice",
      entityId: params.invoiceId,
      branchId: params.branchId,
      after: {
        invoiceNumber: params.invoice.invoiceNumber,
        customerId: params.invoice.customerId,
        totalAmount: params.invoice.totalAmount,
        status: params.invoice.status,
        orderId: params.invoice.orderId,
        reservationId: params.invoice.reservationId,
      },
      metadata: {
        requestId: params.requestId,
      },
    });
  }

  /**
   * Log invoice status change
   */
  async logInvoiceStatusChange(params: {
    userId: string;
    invoiceId: string;
    branchId: string;
    oldStatus: string;
    newStatus: string;
    oldPaidAmount: number;
    newPaidAmount: number;
    oldRemainingAmount: number;
    newRemainingAmount: number;
    reason?: string;
  }): Promise<void> {
    await this.log({
      userId: params.userId,
      action: FinancialAuditAction.INVOICE_STATUS_CHANGED,
      entityType: "invoice",
      entityId: params.invoiceId,
      branchId: params.branchId,
      before: {
        status: params.oldStatus,
        paidAmount: params.oldPaidAmount,
        remainingAmount: params.oldRemainingAmount,
      },
      after: {
        status: params.newStatus,
        paidAmount: params.newPaidAmount,
        remainingAmount: params.newRemainingAmount,
      },
      metadata: {
        reason: params.reason,
      },
    });
  }

  /**
   * Log payment creation
   */
  async logPaymentCreated(params: {
    userId: string;
    paymentId: string;
    branchId: string;
    payment: any;
    idempotencyKey: string;
    requestId?: string;
  }): Promise<void> {
    await this.log({
      userId: params.userId,
      action: FinancialAuditAction.PAYMENT_CREATED,
      entityType: "payment",
      entityId: params.paymentId,
      branchId: params.branchId,
      after: {
        paymentReference: params.payment.paymentReference,
        amount: params.payment.amount,
        method: params.payment.method,
        status: params.payment.status,
        invoiceId: params.payment.invoiceId,
        customerId: params.payment.customerId,
        idempotencyKey: params.idempotencyKey,
        // Do NOT log full card numbers or sensitive payment details
        externalTransactionId: params.payment.externalTransactionId,
        providerId: params.payment.providerId,
      },
      metadata: {
        requestId: params.requestId,
      },
    });
  }

  /**
   * Log duplicate payment attempt (idempotency)
   */
  async logDuplicatePaymentAttempt(params: {
    userId: string;
    existingPaymentId: string;
    branchId: string;
    idempotencyKey: string;
  }): Promise<void> {
    await this.log({
      userId: params.userId,
      action: FinancialAuditAction.PAYMENT_DUPLICATE_ATTEMPTED,
      entityType: "payment",
      entityId: params.existingPaymentId,
      branchId: params.branchId,
      metadata: {
        idempotencyKey: params.idempotencyKey,
        result: "returned_existing",
      },
    });
  }

  /**
   * Log payment allocation to invoice
   */
  async logPaymentAllocation(params: {
    userId: string;
    paymentId: string;
    invoiceId: string;
    branchId: string;
    amount: number;
  }): Promise<void> {
    await this.log({
      userId: params.userId,
      action: FinancialAuditAction.PAYMENT_ALLOCATION_CREATED,
      entityType: "payment_allocation",
      entityId: params.paymentId,
      branchId: params.branchId,
      after: {
        paymentId: params.paymentId,
        invoiceId: params.invoiceId,
        amount: params.amount,
      },
    });
  }

  /**
   * Log refund creation
   */
  async logRefundCreated(params: {
    userId: string;
    refundId: string;
    branchId: string;
    refund: any;
    requestId?: string;
  }): Promise<void> {
    await this.log({
      userId: params.userId,
      action: FinancialAuditAction.REFUND_CREATED,
      entityType: "refund",
      entityId: params.refundId,
      branchId: params.branchId,
      after: {
        refundReference: params.refund.refundReference,
        amount: params.refund.amount,
        method: params.refund.method,
        reason: params.refund.reason,
        status: params.refund.status,
        paymentId: params.refund.paymentId,
      },
      metadata: {
        requestId: params.requestId,
      },
    });
  }

  /**
   * Log webhook event
   */
  async logWebhookEvent(params: {
    providerId: string;
    eventId: string;
    eventType: string;
    providerTransactionId: string;
    paymentId: string | null;
    status: string;
    result: "processed" | "duplicate" | "rejected" | "unknown_transaction";
    error?: string;
  }): Promise<void> {
    await this.log({
      userId: null,
      action:
        params.result === "processed"
          ? FinancialAuditAction.WEBHOOK_PROCESSED
          : params.result === "duplicate"
          ? FinancialAuditAction.WEBHOOK_DUPLICATE
          : FinancialAuditAction.WEBHOOK_REJECTED,
      entityType: "webhook",
      entityId: params.eventId,
      after: {
        providerId: params.providerId,
        eventType: params.eventType,
        providerTransactionId: params.providerTransactionId,
        paymentId: params.paymentId,
        status: params.status,
        result: params.result,
      },
      errorDetails: params.error,
    });
  }

  /**
   * Log failed financial operation
   */
  async logFailedOperation(params: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    branchId?: string;
    errorCode: string;
    errorMessage: string;
    attemptedData?: any;
  }): Promise<void> {
    await this.log({
      userId: params.userId,
      action: `${params.action}.failed`,
      entityType: params.entityType,
      entityId: params.entityId,
      branchId: params.branchId,
      before: this.maskSensitiveData(params.attemptedData),
      errorDetails: `${params.errorCode}: ${params.errorMessage}`,
    });
  }

  /**
   * Log balance integrity check
   */
  async logBalanceIntegrityCheck(params: {
    entityType: "invoice" | "payment";
    entityId: string;
    branchId: string;
    passed: boolean;
    expected: Record<string, number>;
    actual: Record<string, number>;
    difference?: Record<string, number>;
  }): Promise<void> {
    await this.log({
      userId: null,
      action: params.passed
        ? FinancialAuditAction.BALANCE_INTEGRITY_CHECK
        : FinancialAuditAction.BALANCE_INTEGRITY_FAILURE,
      entityType: params.entityType,
      entityId: params.entityId,
      branchId: params.branchId,
      before: { expected: params.expected },
      after: { actual: params.actual },
      metadata: {
        passed: params.passed,
        difference: params.difference,
      },
    });
  }

  /**
   * Log concurrent operation conflict
   */
  async logConcurrentConflict(params: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    branchId: string;
    conflictDetails: string;
  }): Promise<void> {
    await this.log({
      userId: params.userId,
      action: FinancialAuditAction.CONCURRENT_OPERATION_CONFLICT,
      entityType: params.entityType,
      entityId: params.entityId,
      branchId: params.branchId,
      metadata: {
        attemptedAction: params.action,
        conflictDetails: params.conflictDetails,
      },
    });
  }

  /**
   * Log deadlock retry
   */
  async logDeadlockRetry(params: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    branchId: string;
    attempt: number;
    maxAttempts: number;
  }): Promise<void> {
    await this.log({
      userId: params.userId,
      action: FinancialAuditAction.DEADLOCK_RETRY,
      entityType: params.entityType,
      entityId: params.entityId,
      branchId: params.branchId,
      metadata: {
        attemptedAction: params.action,
        attempt: params.attempt,
        maxAttempts: params.maxAttempts,
      },
    });
  }

  /**
   * Mask sensitive data before logging
   * Protects: card numbers, CVV, passwords, API keys, etc.
   */
  private maskSensitiveData(data: any): any {
    if (!data) return data;

    // Clone to avoid mutating original
    const cloned = JSON.parse(JSON.stringify(data));

    return this.maskRecursive(cloned);
  }

  private maskRecursive(obj: any): any {
    if (!obj || typeof obj !== "object") return obj;

    const sensitiveFields = [
      "cardNumber",
      "card_number",
      "cvv",
      "cvc",
      "password",
      "passwordHash",
      "apiKey",
      "api_key",
      "secret",
      "token",
      "accessToken",
      "refreshToken",
      "privateKey",
      "webhookSecret",
    ];

    for (const key in obj) {
      if (sensitiveFields.includes(key)) {
        // Mask completely
        obj[key] = "***REDACTED***";
      } else if (key === "externalTransactionId" && typeof obj[key] === "string") {
        // Partial mask (show last 4 chars)
        const value = obj[key];
        obj[key] = value.length > 4 ? "*".repeat(value.length - 4) + value.slice(-4) : "****";
      } else if (typeof obj[key] === "object") {
        // Recurse
        obj[key] = this.maskRecursive(obj[key]);
      }
    }

    return obj;
  }

  /**
   * Query audit logs for a specific entity
   */
  async getAuditTrail(params: {
    entityType: string;
    entityId: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  }): Promise<any[]> {
    const where: Prisma.AuditLogWhereInput = {
      entityType: params.entityType,
      entityId: params.entityId,
    };

    if (params.fromDate || params.toDate) {
      where.createdAt = {};
      if (params.fromDate) where.createdAt.gte = params.fromDate;
      if (params.toDate) where.createdAt.lte = params.toDate;
    }

    return await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params.limit || 100,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Query financial audit logs by action type
   */
  async getFinancialAuditsByAction(params: {
    action: FinancialAuditAction | string;
    fromDate?: Date;
    toDate?: Date;
    branchId?: string;
    limit?: number;
  }): Promise<any[]> {
    const where: Prisma.AuditLogWhereInput = {
      action: params.action,
    };

    if (params.branchId) {
      where.branchId = params.branchId;
    }

    if (params.fromDate || params.toDate) {
      where.createdAt = {};
      if (params.fromDate) where.createdAt.gte = params.fromDate;
      if (params.toDate) where.createdAt.lte = params.toDate;
    }

    return await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params.limit || 100,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }
}
