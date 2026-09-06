import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxService } from './outbox.service.js';
import { NotificationsService } from './notifications.service.js';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
  OrderConfirmedEvent,
  PaymentReceivedEvent,
  InstallmentDueEvent,
  ReservationExpiringEvent,
  LetterIssuedEvent,
  TransferInitiatedEvent,
} from './notifications.types.js';

@Injectable()
export class NotificationEventProcessor {
  private readonly logger = new Logger(NotificationEventProcessor.name);
  private isProcessing = false;

  constructor(
    @Inject(OutboxService) private outboxService: OutboxService,
    @Inject(NotificationsService) private notificationsService: NotificationsService,
  ) {}

  /**
   * Poll outbox every 30 seconds for unprocessed events
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async processOutboxEvents(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug('Already processing events, skipping this cycle');
      return;
    }

    this.isProcessing = true;

    try {
      const events = await this.outboxService.getUnprocessedEvents(50);

      if (events.length === 0) {
        return;
      }

      this.logger.log(`Processing ${events.length} events from outbox`);

      const processedIds: string[] = [];

      for (const event of events) {
        try {
          await this.handleEvent(event);
          processedIds.push(event.id);
        } catch (error) {
          this.logger.error(
            `Failed to process event ${event.id}: ${(error as Error).message}`,
            (error as Error).stack,
          );
          // Continue processing other events
        }
      }

      if (processedIds.length > 0) {
        await this.outboxService.markManyAsProcessed(processedIds);
        this.logger.log(`Marked ${processedIds.length} events as processed`);
      }
    } catch (error) {
      this.logger.error(
        `Error in outbox processing: ${(error as Error).message}`,
        (error as Error).stack,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Route event to appropriate handler
   */
  private async handleEvent(event: any): Promise<void> {
    switch (event.eventType) {
      case 'order.confirmed':
        await this.handleOrderConfirmed(event as OrderConfirmedEvent);
        break;
      case 'payment.received':
        await this.handlePaymentReceived(event as PaymentReceivedEvent);
        break;
      case 'installment.due':
        await this.handleInstallmentDue(event as InstallmentDueEvent);
        break;
      case 'reservation.expiring':
        await this.handleReservationExpiring(event as ReservationExpiringEvent);
        break;
      case 'letter.issued':
        await this.handleLetterIssued(event as LetterIssuedEvent);
        break;
      case 'transfer.initiated':
        await this.handleTransferInitiated(event as TransferInitiatedEvent);
        break;
      default:
        this.logger.warn(`Unknown event type: ${event.eventType}`);
    }
  }

  private async handleOrderConfirmed(event: OrderConfirmedEvent): Promise<void> {
    const { payload } = event;

    // Find user ID for customer (if customer has account)
    const customer = await this.notificationsService.findUserByCustomerId(
      payload.customerId,
    );

    if (customer?.userId) {
      await this.notificationsService.create({
        userId: customer.userId,
        branchId: payload.branchId,
        type: NotificationType.ORDER_CONFIRMED,
        channel: NotificationChannel.IN_APP,
        priority: NotificationPriority.HIGH,
        title: 'Order Confirmed',
        titleAr: 'تم تأكيد الطلب',
        message: `Your order #${payload.orderNumber} for ${payload.motorcycleName} has been confirmed. Total: ${payload.totalAmount} EGP`,
        messageAr: `تم تأكيد طلبك #${payload.orderNumber} لـ ${payload.motorcycleName}. المجموع: ${payload.totalAmount} ريال`,
        data: {
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
          motorcycleName: payload.motorcycleName,
          totalAmount: payload.totalAmount,
        },
      });
    }

    // Send SMS notification
    if (payload.customerPhone) {
      await this.notificationsService.sendDirectNotification({
        channel: NotificationChannel.SMS,
        recipient: payload.customerPhone,
        type: NotificationType.ORDER_CONFIRMED,
        content: {
          titleEn: 'Order Confirmed',
          titleAr: 'تم تأكيد الطلب',
          bodyEn: `Order #${payload.orderNumber} confirmed for ${payload.motorcycleName}`,
          bodyAr: `تم تأكيد الطلب #${payload.orderNumber} لـ ${payload.motorcycleName}`,
        },
        data: payload,
      });
    }
  }

  private async handlePaymentReceived(event: PaymentReceivedEvent): Promise<void> {
    const { payload } = event;

    const customer = await this.notificationsService.findUserByCustomerId(
      payload.customerId,
    );

    if (customer?.userId) {
      await this.notificationsService.create({
        userId: customer.userId,
        branchId: payload.branchId,
        type: NotificationType.PAYMENT_RECEIVED,
        channel: NotificationChannel.IN_APP,
        priority: NotificationPriority.NORMAL,
        title: 'Payment Received',
        titleAr: 'تم استلام الدفعة',
        message: `Payment of ${payload.amount} EGP received via ${payload.method}`,
        messageAr: `تم استلام دفعة بقيمة ${payload.amount} ريال عبر ${payload.method}`,
        data: {
          paymentId: payload.paymentId,
          amount: payload.amount,
          method: payload.method,
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
        },
      });
    }
  }

  private async handleInstallmentDue(event: InstallmentDueEvent): Promise<void> {
    const { payload } = event;

    const customer = await this.notificationsService.findUserByCustomerId(
      payload.customerId,
    );

    if (customer?.userId) {
      await this.notificationsService.create({
        userId: customer.userId,
        branchId: payload.branchId,
        type: NotificationType.INSTALLMENT_DUE,
        channel: NotificationChannel.IN_APP,
        priority: NotificationPriority.HIGH,
        title: 'Installment Due',
        titleAr: 'قسط مستحق',
        message: `Installment of ${payload.amount} EGP is due on ${payload.dueDate}`,
        messageAr: `قسط بقيمة ${payload.amount} ريال مستحق في ${payload.dueDate}`,
        data: {
          installmentId: payload.installmentId,
          amount: payload.amount,
          dueDate: payload.dueDate,
          contractId: payload.contractId,
        },
        scheduledFor: new Date(payload.dueDate),
      });
    }

    // Send reminder SMS 3 days before due date
    if (payload.customerPhone) {
      await this.notificationsService.sendDirectNotification({
        channel: NotificationChannel.SMS,
        recipient: payload.customerPhone,
        type: NotificationType.INSTALLMENT_DUE,
        content: {
          titleEn: 'Installment Reminder',
          titleAr: 'تذكير بالقسط',
          bodyEn: `Installment of ${payload.amount} EGP due on ${payload.dueDate}`,
          bodyAr: `قسط بقيمة ${payload.amount} ريال مستحق في ${payload.dueDate}`,
        },
        data: payload,
      });
    }
  }

  private async handleReservationExpiring(
    event: ReservationExpiringEvent,
  ): Promise<void> {
    const { payload } = event;

    const customer = await this.notificationsService.findUserByCustomerId(
      payload.customerId,
    );

    if (customer?.userId) {
      await this.notificationsService.create({
        userId: customer.userId,
        branchId: payload.branchId,
        type: NotificationType.RESERVATION_EXPIRING,
        channel: NotificationChannel.IN_APP,
        priority: NotificationPriority.URGENT,
        title: 'Reservation Expiring Soon',
        titleAr: 'الحجز على وشك الانتهاء',
        message: `Your reservation for ${payload.motorcycleName} expires on ${payload.expiresAt}`,
        messageAr: `حجزك لـ ${payload.motorcycleName} ينتهي في ${payload.expiresAt}`,
        data: {
          reservationId: payload.reservationId,
          motorcycleName: payload.motorcycleName,
          expiresAt: payload.expiresAt,
        },
      });
    }
  }

  private async handleLetterIssued(event: LetterIssuedEvent): Promise<void> {
    const { payload } = event;

    const customer = await this.notificationsService.findUserByCustomerId(
      payload.customerId,
    );

    if (customer?.userId) {
      await this.notificationsService.create({
        userId: customer.userId,
        branchId: payload.branchId,
        type: NotificationType.LETTER_ISSUED,
        channel: NotificationChannel.IN_APP,
        priority: NotificationPriority.HIGH,
        title: 'Letter Issued',
        titleAr: 'تم إصدار الخطاب',
        message: `${payload.type} letter #${payload.letterNumber} has been issued for ${payload.motorcycleName}`,
        messageAr: `تم إصدار خطاب ${payload.type} #${payload.letterNumber} لـ ${payload.motorcycleName}`,
        data: {
          letterId: payload.letterId,
          letterNumber: payload.letterNumber,
          motorcycleName: payload.motorcycleName,
          type: payload.type,
        },
      });
    }
  }

  private async handleTransferInitiated(
    event: TransferInitiatedEvent,
  ): Promise<void> {
    const { payload } = event;

    // Notify user who initiated transfer
    await this.notificationsService.create({
      userId: payload.userId,
      branchId: payload.fromBranchId,
      type: NotificationType.TRANSFER_INITIATED,
      channel: NotificationChannel.IN_APP,
      priority: NotificationPriority.NORMAL,
      title: 'Transfer Initiated',
      titleAr: 'تم بدء النقل',
      message: `Transfer of ${payload.motorcycleName} from ${payload.fromBranchName} to ${payload.toBranchName} has been initiated`,
      messageAr: `تم بدء نقل ${payload.motorcycleName} من ${payload.fromBranchName} إلى ${payload.toBranchName}`,
      data: {
        transferId: payload.transferId,
        motorcycleName: payload.motorcycleName,
        fromBranchId: payload.fromBranchId,
        fromBranchName: payload.fromBranchName,
        toBranchId: payload.toBranchId,
        toBranchName: payload.toBranchName,
      },
    });
  }

  /**
   * Cleanup old processed events monthly
   */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async cleanupOldEvents(): Promise<void> {
    this.logger.log('Running monthly outbox cleanup');
    await this.outboxService.cleanupProcessedEvents(30);
  }
}
