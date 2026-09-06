import { NotificationChannel } from '../notifications.types.js';

export interface NotificationMessage {
  recipient: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

export interface DeliveryResult {
  success: boolean;
  externalId?: string;
  errorMessage?: string;
}

export abstract class NotificationChannelProvider {
  abstract readonly channel: NotificationChannel;

  abstract send(message: NotificationMessage): Promise<DeliveryResult>;

  abstract supportsChannel(channel: NotificationChannel): boolean;
}
