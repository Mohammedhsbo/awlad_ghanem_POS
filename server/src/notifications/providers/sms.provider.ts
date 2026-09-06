import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannelProvider,
  NotificationMessage,
  DeliveryResult,
} from './notification-channel.provider.js';
import { NotificationChannel } from '../notifications.types.js';

/**
 * SMS Provider Stub
 * TODO: Integrate with actual SMS service (Twilio, Unifonic, etc.)
 */
@Injectable()
export class SmsProvider extends NotificationChannelProvider {
  readonly channel = NotificationChannel.SMS;
  private readonly logger = new Logger(SmsProvider.name);

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    try {
      // Stub implementation - log the SMS
      this.logger.log(`[SMS STUB] To: ${message.recipient}`);
      this.logger.debug(`[SMS STUB] Message: ${message.body}`);

      // TODO: Implement actual SMS sending
      // Example with Twilio:
      // const sms = await this.twilioClient.messages.create({
      //   to: message.recipient,
      //   from: process.env.TWILIO_PHONE_NUMBER,
      //   body: message.body,
      // });
      // return { success: true, externalId: sms.sid };

      return {
        success: true,
        externalId: `sms_stub_${Date.now()}`,
      };
    } catch (error) {
      this.logger.error(`Failed to send SMS: ${(error as Error).message}`, (error as Error).stack);

      return {
        success: false,
        errorMessage: (error as Error).message,
      };
    }
  }

  supportsChannel(channel: NotificationChannel): boolean {
    return channel === NotificationChannel.SMS;
  }
}
