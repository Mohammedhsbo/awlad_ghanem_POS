import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';
import { OutboxService } from './outbox.service.js';
import { NotificationEventProcessor } from './notification-event.processor.js';
import { NotificationTemplateService } from './notification-template.service.js';
import { NotificationPreferenceService } from './notification-preference.service.js';
import { DeliveryTrackerService } from './delivery-tracker.service.js';

// Providers
import { InAppProvider } from './providers/in-app.provider.js';
import { EmailProvider } from './providers/email.provider.js';
import { SmsProvider } from './providers/sms.provider.js';
import { WhatsAppProvider } from './providers/whatsapp.provider.js';
import { PushProvider } from './providers/push.provider.js';
import { NOTIFICATION_CHANNEL_PROVIDERS } from './notification-provider.tokens.js';

import { PrismaModule } from '../prisma/prisma.module.js';
import { SocketModule } from '../socket/socket.module.js';

@Module({
  imports: [
    PrismaModule,
    SocketModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    OutboxService,
    NotificationEventProcessor,
    NotificationTemplateService,
    NotificationPreferenceService,
    DeliveryTrackerService,
    // Channel Providers
    InAppProvider,
    EmailProvider,
    SmsProvider,
    WhatsAppProvider,
    PushProvider,
    {
      provide: NOTIFICATION_CHANNEL_PROVIDERS,
      useFactory: (
        inAppProvider: InAppProvider,
        emailProvider: EmailProvider,
        smsProvider: SmsProvider,
        whatsAppProvider: WhatsAppProvider,
        pushProvider: PushProvider,
      ) => [
        inAppProvider,
        emailProvider,
        smsProvider,
        whatsAppProvider,
        pushProvider,
      ],
      inject: [
        InAppProvider,
        EmailProvider,
        SmsProvider,
        WhatsAppProvider,
        PushProvider,
      ],
    },
  ],
  exports: [
    NotificationsService,
    OutboxService,
    NotificationTemplateService,
    NotificationPreferenceService,
  ],
})
export class NotificationsModule {}
