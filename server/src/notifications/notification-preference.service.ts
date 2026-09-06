import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationChannel, NotificationType } from './notifications.types.js';

@Injectable()
export class NotificationPreferenceService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  /**
   * Check if user has enabled notification for type and channel
   */
  async isEnabled(
    userId: string,
    type: NotificationType,
    channel: NotificationChannel,
  ): Promise<boolean> {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: {
        userId_type_channel: {
          userId,
          type,
          channel,
        },
      },
    });

    // If no preference set, default to enabled for IN_APP, disabled for others
    if (!preference) {
      return channel === NotificationChannel.IN_APP;
    }

    return preference.isEnabled;
  }

  /**
   * Get all preferences for a user
   */
  async getUserPreferences(userId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: [{ type: 'asc' }, { channel: 'asc' }],
    });
  }

  /**
   * Update preference
   */
  async updatePreference(
    userId: string,
    type: NotificationType,
    channel: NotificationChannel,
    isEnabled: boolean,
  ) {
    return this.prisma.notificationPreference.upsert({
      where: {
        userId_type_channel: {
          userId,
          type,
          channel,
        },
      },
      create: {
        userId,
        type,
        channel,
        isEnabled,
      },
      update: {
        isEnabled,
      },
    });
  }

  /**
   * Update multiple preferences at once
   */
  async updateMultiplePreferences(
    userId: string,
    preferences: Array<{
      type: NotificationType;
      channel: NotificationChannel;
      isEnabled: boolean;
    }>,
  ) {
    const operations = preferences.map((pref) =>
      this.updatePreference(userId, pref.type, pref.channel, pref.isEnabled),
    );

    return Promise.all(operations);
  }

  /**
   * Initialize default preferences for a new user
   */
  async initializeDefaultPreferences(userId: string): Promise<void> {
    const notificationTypes = Object.values(NotificationType);
    const channels = Object.values(NotificationChannel);

    const defaultPreferences = [];

    for (const type of notificationTypes) {
      for (const channel of channels) {
        // Default: IN_APP enabled, others disabled
        const isEnabled = channel === NotificationChannel.IN_APP;

        defaultPreferences.push({
          userId,
          type,
          channel,
          isEnabled,
        });
      }
    }

    await this.prisma.notificationPreference.createMany({
      data: defaultPreferences,
      skipDuplicates: true,
    });
  }

  /**
   * Enable all notifications for a user
   */
  async enableAll(userId: string): Promise<void> {
    await this.prisma.notificationPreference.updateMany({
      where: { userId },
      data: { isEnabled: true },
    });
  }

  /**
   * Disable all notifications for a user (except critical ones)
   */
  async disableAll(userId: string, exceptCritical: boolean = true): Promise<void> {
    const criticalTypes = [
      NotificationType.INSTALLMENT_OVERDUE,
      NotificationType.RESERVATION_EXPIRED,
      NotificationType.SYSTEM_ALERT,
    ];

    if (exceptCritical) {
      await this.prisma.notificationPreference.updateMany({
        where: {
          userId,
          type: {
            notIn: criticalTypes,
          },
        },
        data: { isEnabled: false },
      });
    } else {
      await this.prisma.notificationPreference.updateMany({
        where: { userId },
        data: { isEnabled: false },
      });
    }
  }
}
