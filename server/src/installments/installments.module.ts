import { Module } from '@nestjs/common';
import { InstallmentsService } from './installments.service.js';
import { InstallmentsController } from './installments.controller.js';
import { InstallmentsSchedulerService } from './installments-scheduler.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [PrismaModule, AuditModule, PaymentsModule, NotificationsModule],
  controllers: [InstallmentsController],
  providers: [InstallmentsService, InstallmentsSchedulerService],
  exports: [InstallmentsService, InstallmentsSchedulerService],
})
export class InstallmentsModule {}
