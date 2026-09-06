import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { DashboardService } from './dashboard.service.js';
import { SalesService } from './sales.service.js';
import { InventoryService } from './inventory.service.js';
import { InstallmentsService } from './installments.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [DashboardService, SalesService, InventoryService, InstallmentsService],
  exports: [DashboardService, SalesService, InventoryService, InstallmentsService],
})
export class ReportsModule {}
