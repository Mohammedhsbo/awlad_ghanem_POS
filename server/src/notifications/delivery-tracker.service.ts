import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationChannelProvider } from './providers/notification-channel.provider.js';
import { NotificationChannel, NotificationStatus } from './notifications.types.js';
import { NOTIFICATION_CHANNEL_PROVIDERS } from './notification-provider.tokens.js';

@Injectable()
export class DeliveryTrackerService {
  private readonly logger = new Logger(DeliveryTrackerService.name);
  private readonly providers: Map<NotificationChannel, NotificationChannelProvider>;

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(NOTIFICATION_CHANNEL_PROVIDERS) providers: NotificationChannelProvider[],
  ) {
    this.providers = new Map();
    providers.forEach((provider) => {
      this.providers.set(provider.channel, provider);
    });
  }

  /**
   * Track delivery for a notification
   */
  async trackDelivery(
    notificationId: string,
    channel: NotificationChannel,
    recipient: string,
  ): Promise<string> {
    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        notificationId,
        channel,
        recipient,
        status: NotificationStatus.PENDING,
        attempts: 0,
        maxAttempts: 3,
      },
    });

    // Attempt immediate delivery
    await this.attemptDelivery(delivery.id);

    return delivery.id;
  }

  /**
   * Attempt to deliver a notification
   */
  async attemptDelivery(deliveryId: string): Promise<boolean> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        notification: true,
      },
    });

    if (!delivery) {
      this.logger.warn(`Delivery ${deliveryId} not found`);
      return false;
    }

    if (delivery.attempts >= delivery.maxAttempts) {
      this.logger.warn(
        `Delivery ${deliveryId} exceeded max attempts (${delivery.maxAttempts})`,
      );
      await this.markAsFailed(deliveryId, 'Max attempts exceeded');
      return false;
    }

    const provider = this.providers.get(delivery.channel as NotificationChannel);
    if (!provider) {
      this.logger.error(`No provider found for channel ${delivery.channel}`);
      await this.markAsFailed(deliveryId, `No provider for ${delivery.channel}`);
      return false;
    }

    try {
      // Increment attempts
      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          attempts: { increment: 1 },
          status: NotificationStatus.SENT,
        },
      });

      // Send via provider
      const result = await provider.send({
        recipient: delivery.recipient,
        title: delivery.notification.title,
        body: delivery.notification.message,
        data: delivery.notification.data as any,
      });

      if (result.success) {
        await this.markAsDelivered(deliveryId, result.externalId);
        return true;
      } else {
        await this.markAsFailed(deliveryId, result.errorMessage);
        return false;
      }
    } catch (error) {
      this.logger.error(
        `Error during delivery attempt: ${(error as Error).message}`,
        (error as Error).stack,
      );
      await this.markAsFailed(deliveryId, (error as Error).message);
      return false;
    }
  }

  /**
   * Mark delivery as delivered
   */
  private async markAsDelivered(
    deliveryId: string,
    externalId?: string,
  ): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: NotificationStatus.DELIVERED,
        deliveredAt: new Date(),
        externalId,
      },
    });

    this.logger.debug(`Delivery ${deliveryId} marked as delivered`);
  }

  /**
   * Mark delivery as failed
   */
  private async markAsFailed(
    deliveryId: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: NotificationStatus.FAILED,
        failedAt: new Date(),
        errorMessage,
      },
    });

    this.logger.warn(`Delivery ${deliveryId} marked as failed: ${errorMessage}`);
  }

  /**
   * Retry failed deliveries (runs every 5 minutes)
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryFailedDeliveries(): Promise<void> {
    this.logger.debug('Running retry job for failed deliveries');

    const failedDeliveries = await this.prisma.notificationDelivery.findMany({
      where: {
        status: NotificationStatus.FAILED,
        attempts: {
          lt: this.prisma.notificationDelivery.fields.maxAttempts,
        },
        failedAt: {
          // Only retry if last failure was more than 5 minutes ago
          lt: new Date(Date.now() - 5 * 60 * 1000),
        },
      },
      take: 50,
    });

    if (failedDeliveries.length === 0) {
      return;
    }

    this.logger.log(`Retrying ${failedDeliveries.length} failed deliveries`);

    for (const delivery of failedDeliveries) {
      await this.attemptDelivery(delivery.id);
    }
  }

  /**
   * Process scheduled notifications (runs every minute)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledNotifications(): Promise<void> {
    const now = new Date();

    const scheduledNotifications = await this.prisma.notification.findMany({
      where: {
        scheduledFor: {
          lte: now,
        },
        status: NotificationStatus.PENDING,
      },
      take: 100,
    });

    if (scheduledNotifications.length === 0) {
      return;
    }

    this.logger.log(
      `Processing ${scheduledNotifications.length} scheduled notifications`,
    );

    for (const notification of scheduledNotifications) {
      try {
        // Get user preferences for channel
        const user = await this.prisma.user.findUnique({
          where: { id: notification.userId },
        });

        if (!user) {
          continue;
        }

        // Track delivery
        await this.trackDelivery(
          notification.id,
          notification.channel as NotificationChannel,
          user.id,
        );

        // Mark notification as sent
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
      } catch (error) {
        this.logger.error(
          `Error processing scheduled notification ${notification.id}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }
  }
}
