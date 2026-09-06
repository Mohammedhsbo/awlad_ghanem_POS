import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannelProvider,
  NotificationMessage,
  DeliveryResult,
} from './notification-channel.provider.js';
import { NotificationChannel } from '../notifications.types.js';
import { SocketGateway } from '../../socket/socket.gateway.js';

@Injectable()
export class InAppProvider extends NotificationChannelProvider {
  readonly channel = NotificationChannel.IN_APP;
  private readonly logger = new Logger(InAppProvider.name);

  constructor(@Inject(SocketGateway) private socketGateway: SocketGateway) {
    super();
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    try {
      // Emit to all connected clients (they filter on frontend based on userId)
      // Alternative: implement user-specific rooms in SocketGateway
      this.socketGateway.server.emit('notification', {
        userId: message.recipient,
        title: message.title,
        body: message.body,
        data: message.data,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug(`In-app notification sent to user ${message.recipient}`);

      return {
        success: true,
        externalId: `inapp_${Date.now()}`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send in-app notification: ${(error as Error).message}`,
        (error as Error).stack,
      );

      return {
        success: false,
        errorMessage: (error as Error).message,
      };
    }
  }

  supportsChannel(channel: NotificationChannel): boolean {
    return channel === NotificationChannel.IN_APP;
  }
}
