import { Module } from '@nestjs/common';
import { MotorcyclesService } from './motorcycles.service.js';
import { MotorcyclesController } from './motorcycles.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { SocketModule } from '../socket/index.js';

@Module({
  imports: [PrismaModule, AuditModule, SocketModule],
  controllers: [MotorcyclesController],
  providers: [MotorcyclesService],
  exports: [MotorcyclesService],
})
export class MotorcyclesModule {}
