import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannelProvider,
  NotificationMessage,
  DeliveryResult,
} from './notification-channel.provider.js';
import { NotificationChannel } from '../notifications.types.js';

/**
 * Email Provider Stub
 * TODO: Integrate with actual email service (SendGrid, AWS SES, etc.)
 */
@Injectable()
export class EmailProvider extends NotificationChannelProvider {
  readonly channel = NotificationChannel.EMAIL;
  private readonly logger = new Logger(EmailProvider.name);

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    try {
      // Stub implementation - log the email
      this.logger.log(
        `[EMAIL STUB] To: ${message.recipient}, Subject: ${message.title}`,
      );
      this.logger.debug(`[EMAIL STUB] Body: ${message.body}`);

      // TODO: Implement actual email sending
      // Example with SendGrid:
      // const msg = {
      //   to: message.recipient,
      //   from: 'noreply@motorcyclesystem.com',
      //   subject: message.title,
      //   html: message.body,
      // };
      // await this.sendgridClient.send(msg);

      return {
        success: true,
        externalId: `email_stub_${Date.now()}`,
      };
    } catch (error) {
      this.logger.error(`Failed to send email: ${(error as Error).message}`, (error as Error).stack);

      return {
        success: false,
        errorMessage: (error as Error).message,
      };
    }
  }

  supportsChannel(channel: NotificationChannel): boolean {
    return channel === NotificationChannel.EMAIL;
  }
}
