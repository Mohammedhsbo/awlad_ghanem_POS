import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannelProvider,
  NotificationMessage,
  DeliveryResult,
} from './notification-channel.provider.js';
import { NotificationChannel } from '../notifications.types.js';

/**
 * Push Notification Provider Stub
 * TODO: Integrate with Firebase Cloud Messaging (FCM) or similar
 */
@Injectable()
export class PushProvider extends NotificationChannelProvider {
  readonly channel = NotificationChannel.PUSH;
  private readonly logger = new Logger(PushProvider.name);

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    try {
      // Stub implementation - log the push notification
      this.logger.log(`[PUSH STUB] To: ${message.recipient}`);
      this.logger.debug(
        `[PUSH STUB] Title: ${message.title}, Body: ${message.body}`,
      );

      // TODO: Implement actual push notification sending
      // Example with FCM:
      // const payload = {
      //   notification: {
      //     title: message.title,
      //     body: message.body,
      //   },
      //   data: message.data || {},
      //   token: message.recipient, // FCM device token
      // };
      // const response = await this.fcmClient.send(payload);
      // return { success: true, externalId: response.messageId };

      return {
        success: true,
        externalId: `push_stub_${Date.now()}`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send push notification: ${(error as Error).message}`,
        (error as Error).stack,
      );

      return {
        success: false,
        errorMessage: (error as Error).message,
      };
    }
  }

  supportsChannel(channel: NotificationChannel): boolean {
    return channel === NotificationChannel.PUSH;
  }
}
