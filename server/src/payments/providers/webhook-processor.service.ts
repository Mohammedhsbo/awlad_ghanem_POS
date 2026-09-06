import {
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AuditService } from "../../audit/audit.service.js";
import { PaymentProviderRegistry } from "./payment-provider.registry.js";
import {
  ProviderWebhookEvent,
  ProviderPaymentStatus,
} from "./payment-provider.interface.js";
import { PaymentStatus } from "@motorcycle-system/shared-types";
import { allocatePaymentToInvoice } from "../../utils/financial.js";

/**
 * TASK-011: Webhook Processor Service
 * 
 * Handles idempotent processing of payment provider webhooks.
 * 
 * Requirements:
 * - Idempotent webhook processing
 * - Signature verification
 * - Transaction status reconciliation
 * - Duplicate webhook detection
 * - Audit trail
 */
@Injectable()
export class WebhookProcessorService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PaymentProviderRegistry) private readonly providerRegistry: PaymentProviderRegistry
  ) {}

  /**
   * Process incoming webhook from payment provider
   * 
   * This method ensures idempotent processing:
   * - Same webhook event processed only once
   * - Duplicate events return success without changes
   * - Invalid signatures rejected
   * - Payment status updated atomically
   */
  async processWebhook(params: {
    providerId: string;
    rawPayload: string | Buffer;
    signature: string;
    headers: Record<string, string>;
  }): Promise<{
    processed: boolean;
    paymentId?: string;
    message: string;
  }> {
    const { providerId, rawPayload, signature } = params;

    // Get provider
    const provider = this.providerRegistry.getProvider(providerId);

    // Verify webhook signature
    const verification = await provider.verifyWebhook(rawPayload, signature);

    if (!verification.verified) {
      throw new BadRequestException({
        code: "INVALID_WEBHOOK_SIGNATURE",
        message: verification.error || "Webhook signature verification failed",
      });
    }

    const event = verification.event!;

    // Check if webhook event already processed (idempotency)
    const existingWebhook = await this.prisma.$queryRaw<Array<any>>`
      SELECT id FROM "WebhookEvent"
      WHERE "providerId" = ${providerId}
      AND "eventId" = ${event.eventId}
      LIMIT 1
    `;

    if (existingWebhook && existingWebhook.length > 0) {
      // Webhook already processed
      return {
        processed: false,
        message: "Webhook event already processed",
      };
    }

    // Find payment by provider transaction ID
    const payment = await this.prisma.payment.findFirst({
      where: { externalTransactionId: event.providerTransactionId },
      include: {
        invoice: true,
      },
    });

    if (!payment) {
      // Log unknown transaction webhook
      await this.logWebhookEvent(event, providerId, null, "unknown_transaction");

      return {
        processed: false,
        message: "Payment not found for provider transaction",
      };
    }

    // Process webhook in transaction
    return await this.prisma.$transaction(async (tx) => {
      // Map provider status to internal status
      const newStatus = provider.mapStatus(event.status);

      // Only update if status changed
      if (payment.status === newStatus) {
        await this.logWebhookEvent(event, providerId, payment.id, "no_change");

        return {
          processed: false,
          paymentId: payment.id,
          message: "Payment status unchanged",
        };
      }

      // Update payment status
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          confirmedAt:
            newStatus === PaymentStatus.COMPLETED && !payment.confirmedAt
              ? new Date()
              : payment.confirmedAt,
          failedAt:
            newStatus === PaymentStatus.FAILED && !payment.failedAt
              ? new Date()
              : payment.failedAt,
          failureReason:
            newStatus === PaymentStatus.FAILED && event.rawPayload?.reason
              ? event.rawPayload.reason
              : payment.failureReason,
        },
      });

      // Update invoice status if payment completed (skip for installment payments without invoice)
      if (
        newStatus === PaymentStatus.COMPLETED &&
        payment.status !== PaymentStatus.COMPLETED &&
        payment.invoice != null &&
        payment.invoiceId != null
      ) {
        const allocation = allocatePaymentToInvoice(
          {
            totalAmount: Number(payment.invoice.totalAmount),
            paidAmount: Number(payment.invoice.paidAmount),
          },
          Number(payment.amount)
        );

        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            paidAmount: allocation.newPaidAmount,
            remainingAmount: allocation.newRemainingAmount,
            status: allocation.newStatus,
          },
        });
      }

      // Log webhook event
      await this.logWebhookEvent(event, providerId, payment.id, "processed");

      // Audit log
      await this.audit.log({
        userId: null,
        action: "webhook_update",
        entityType: "payment",
        entityId: payment.id,
        branchId: payment.branchId,
        before: { status: payment.status },
        after: { status: newStatus, eventId: event.eventId },
      });

      return {
        processed: true,
        paymentId: payment.id,
        message: `Payment status updated to ${newStatus}`,
      };
    });
  }

  /**
   * Manually reconcile payment status with provider
   * Used for recovery when webhooks fail
   */
  async reconcilePaymentStatus(params: {
    paymentId: string;
    userId: string;
  }): Promise<{
    reconciled: boolean;
    previousStatus: PaymentStatus;
    newStatus: PaymentStatus;
    message: string;
  }> {
    const { paymentId, userId } = params;

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: true,
      },
    });

    if (!payment) {
      throw new BadRequestException({
        code: "PAYMENT_NOT_FOUND",
        message: "Payment not found",
      });
    }

    if (!payment.providerId || !payment.externalTransactionId) {
      throw new BadRequestException({
        code: "PAYMENT_NOT_EXTERNAL",
        message: "Payment was not processed through external provider",
      });
    }

    // Get provider
    const provider = this.providerRegistry.getProvider(payment.providerId);

    // Verify transaction with provider
    const verification = await provider.verifyTransaction({
      providerTransactionId: payment.externalTransactionId,
      expectedAmount: Number(payment.amount),
    });

    if (!verification.verified) {
      return {
        reconciled: false,
        previousStatus: payment.status as PaymentStatus,
        newStatus: payment.status as PaymentStatus,
        message: "Transaction verification failed with provider",
      };
    }

    // Map provider status
    const newStatus = provider.mapStatus(verification.status);

    if (payment.status === newStatus) {
      return {
        reconciled: false,
        previousStatus: payment.status as PaymentStatus,
        newStatus: payment.status as PaymentStatus,
        message: "Payment status already synchronized",
      };
    }

    // Update payment status
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: newStatus,
        confirmedAt:
          newStatus === PaymentStatus.COMPLETED && !payment.confirmedAt
            ? verification.paidAt || new Date()
            : payment.confirmedAt,
        failedAt:
          newStatus === PaymentStatus.FAILED && !payment.failedAt
            ? new Date()
            : payment.failedAt,
        failureReason:
          newStatus === PaymentStatus.FAILED && verification.failureReason
            ? verification.failureReason
            : payment.failureReason,
      },
    });

    // Audit log
    await this.audit.log({
      userId,
      action: "reconcile",
      entityType: "payment",
      entityId: paymentId,
      branchId: payment.branchId,
      before: { status: payment.status },
      after: { status: newStatus },
    });

    return {
      reconciled: true,
      previousStatus: payment.status as PaymentStatus,
      newStatus,
      message: "Payment status reconciled with provider",
    };
  }

  /**
   * Log webhook event for audit and debugging
   */
  private async logWebhookEvent(
    event: ProviderWebhookEvent,
    providerId: string,
    paymentId: string | null,
    result: string
  ): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "WebhookEvent" (
          "id",
          "providerId",
          "eventId",
          "eventType",
          "providerTransactionId",
          "paymentId",
          "status",
          "result",
          "rawPayload",
          "createdAt"
        ) VALUES (
          gen_random_uuid(),
          ${providerId},
          ${event.eventId},
          ${event.eventType},
          ${event.providerTransactionId},
          ${paymentId}::uuid,
          ${event.status},
          ${result},
          ${JSON.stringify(event.rawPayload)}::jsonb,
          ${event.timestamp}
        )
      `;
    } catch (error) {
      console.error("Failed to log webhook event:", error);
      // Don't throw - webhook processing should continue
    }
  }
}
