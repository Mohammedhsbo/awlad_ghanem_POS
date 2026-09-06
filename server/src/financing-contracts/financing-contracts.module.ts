import { Module } from '@nestjs/common';
import { FinancingContractsController } from './financing-contracts.controller.js';
import { FinancingContractsService } from './financing-contracts.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [FinancingContractsController],
  providers: [FinancingContractsService],
  exports: [FinancingContractsService],
})
export class FinancingContractsModule {}
