import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { SocketModule } from '../socket/socket.module.js';
import { LettersModule } from '../letters/letters.module.js';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    SocketModule,
    forwardRef(() => LettersModule),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
