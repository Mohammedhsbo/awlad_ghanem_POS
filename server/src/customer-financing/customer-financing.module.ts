import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { CustomerFinancingController } from "./customer-financing.controller.js";
import { CustomerFinancingService } from "./customer-financing.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [CustomerFinancingController],
  providers: [CustomerFinancingService],
})
export class CustomerFinancingModule {}
