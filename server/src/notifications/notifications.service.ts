import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateNotificationDto } from './dto/create-notification.dto.js';
import { NotificationQueryDto } from './dto/notification-query.dto.js';
import {
  NotificationChannel,
  NotificationPayload,
  NotificationStatus,
} from './notifications.types.js';
import { DeliveryTrackerService } from './delivery-tracker.service.js';
import { NotificationPreferenceService } from './notification-preference.service.js';
import { NOTIFICATION_CHANNEL_PROVIDERS } from './notification-provider.tokens.js';
import { NotificationChannelProvider } from './providers/notification-channel.provider.js';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(DeliveryTrackerService) private deliveryTracker: DeliveryTrackerService,
    @Inject(NotificationPreferenceService) private preferenceService: NotificationPreferenceService,
    @Inject(NOTIFICATION_CHANNEL_PROVIDERS) private channelProviders: NotificationChannelProvider[],
  ) {}

  /**
   * Create a notification
   */
  async create(dto: CreateNotificationDto) {
    // Check user preferences
    const isEnabled = await this.preferenceService.isEnabled(
      dto.userId,
      dto.type,
      dto.channel,
    );

    if (!isEnabled) {
      this.logger.debug(
        `Notification ${dto.type} on ${dto.channel} disabled for user ${dto.userId}`,
      );
      return null;
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        branchId: dto.branchId,
        type: dto.type,
        channel: dto.channel,
        priority: dto.priority || 'normal',
        title: dto.title,
        titleAr: dto.titleAr,
        message: dto.message,
        messageAr: dto.messageAr,
        data: dto.data as any,
        scheduledFor: dto.scheduledFor,
        expiresAt: dto.expiresAt,
        status: dto.scheduledFor ? NotificationStatus.PENDING : NotificationStatus.SENT,
        sentAt: dto.scheduledFor ? null : new Date(),
      },
    });

    // If not scheduled, deliver immediately
    if (!dto.scheduledFor) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
      });

      if (user) {
        await this.deliveryTracker.trackDelivery(
          notification.id,
          dto.channel,
          user.id,
        );
      }
    }

    return notification;
  }

  /**
   * Get notifications for a user
   */
  async findAll(userId: string, query: NotificationQueryDto) {
    const where: any = { userId };

    if (query.type) {
      where.type = query.type;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.unreadOnly) {
      where.readAt = null;
    }

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: ((query.page || 1) - 1) * (query.limit || 20),
        take: query.limit || 20,
        include: {
          deliveries: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: notifications,
      meta: {
        page: query.page || 1,
        limit: query.limit || 20,
        total,
        totalPages: Math.ceil(total / (query.limit || 20)),
      },
    };
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        readAt: null,
      },
    });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        readAt: new Date(),
        status: NotificationStatus.READ,
      },
    });
  }

  /**
   * Mark multiple notifications as read
   */
  async markManyAsRead(notificationIds: string[], userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId,
      },
      data: {
        readAt: new Date(),
        status: NotificationStatus.READ,
      },
    });
  }

  /**
   * Mark all as read
   */
  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
        status: NotificationStatus.READ,
      },
    });
  }

  /**
   * Delete notification
   */
  async remove(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.delete({
      where: { id: notificationId },
    });
  }

  /**
   * Send direct notification (without user account)
   */
  async sendDirectNotification(payload: {
    channel: NotificationChannel;
    recipient: string;
    type: any;
    content: {
      titleEn: string;
      titleAr: string;
      bodyEn: string;
      bodyAr: string;
    };
    data?: any;
  }): Promise<void> {
    // Log to communication log
    await this.prisma.communicationLog.create({
      data: {
        userId: null,
        customerId: null,
        channel: payload.channel,
        direction: 'outbound',
        subject: payload.content.titleEn,
        content: payload.content.bodyEn,
        metadata: {
          type: payload.type,
          recipient: payload.recipient,
          data: payload.data,
        } as any,
        sentAt: new Date(),
      },
    });

    this.logger.debug(
      `Direct notification sent via ${payload.channel} to ${payload.recipient}`,
    );
  }

  async sendDirectWhatsApp(payload: {
    customerId: string;
    recipient: string;
    body: string;
    attachments?: string[];
    subject?: string;
  }) {
    const message = [payload.body, ...(payload.attachments ?? []).map((ref) => `مرفق بطاقة الهوية / ${ref}`)].join('\n');
    await this.prisma.communicationLog.create({
      data: {
        userId: null,
        customerId: payload.customerId,
        channel: NotificationChannel.WHATSAPP,
        direction: 'outbound',
        subject: payload.subject ?? 'Customer message',
        content: message,
        metadata: { delivery: 'client_link', initiated: true } as any,
        sentAt: new Date(),
      },
    });

    return { phone: payload.recipient, message };
  }

  /**
   * Find user by customer ID
   */
  async findUserByCustomerId(customerId: string): Promise<{ userId: string } | null> {
    // Customers don't have user accounts in this system
    // This is a placeholder for future implementation
    return null;
  }

  /**
   * Create notification from payload
   */
  async createFromPayload(payload: NotificationPayload) {
    return this.create(payload as CreateNotificationDto);
  }
}
