import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannelProvider,
  NotificationMessage,
  DeliveryResult,
} from './notification-channel.provider.js';
import { NotificationChannel } from '../notifications.types.js';
import { buildWhatsAppUrl } from '@motorcycle-system/shared-types';

/**
 * WhatsApp provider records the client-link handoff; the browser opens wa.me.
 */
@Injectable()
export class WhatsAppProvider extends NotificationChannelProvider {
  readonly channel = NotificationChannel.WHATSAPP;
  private readonly logger = new Logger(WhatsAppProvider.name);

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    try {
      const url = buildWhatsAppUrl(message.recipient, message.body);
      this.logger.log(`[WHATSAPP LINK] ${url}`);
      return {
        success: true,
        externalId: url,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send WhatsApp message: ${(error as Error).message}`,
        (error as Error).stack,
      );

      return {
        success: false,
        errorMessage: (error as Error).message,
      };
    }
  }

  supportsChannel(channel: NotificationChannel): boolean {
    return channel === NotificationChannel.WHATSAPP;
  }
}
