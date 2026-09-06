import { Module } from '@nestjs/common';
import { POSController } from './pos.controller.js';
import { POSService } from './pos.service.js';
import { OfflineService } from './offline.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { MotorcyclesModule } from '../motorcycles/motorcycles.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { ReservationsModule } from '../reservations/reservations.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { UploadModule } from '../upload/upload.module.js';

@Module({
  imports: [
    PrismaModule,
    CustomersModule,
    MotorcyclesModule,
    OrdersModule,
    ReservationsModule,
    AuditModule,
    UploadModule,
  ],
  controllers: [POSController],
  providers: [POSService, OfflineService],
  exports: [POSService, OfflineService],
})
export class POSModule {}
