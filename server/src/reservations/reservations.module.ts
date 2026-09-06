import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service.js';
import { ReservationsController } from './reservations.controller.js';
import { CustomersController } from './customers-reservations.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { SocketModule } from '../socket/socket.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [PrismaModule, AuditModule, SocketModule, OrdersModule, NotificationsModule],
  controllers: [ReservationsController, CustomersController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
