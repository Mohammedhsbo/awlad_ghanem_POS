import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { CustomersController } from "./customers.controller.js";
import { CustomerSelfFinancialController, CustomersFinancialController } from "./customers-financial.controller.js";
import { CustomersService } from "./customers.service.js";
import { CustomersFinancialService } from "./customers-financial.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";

@Module({
  imports: [AuthModule, AuditModule, OrdersModule, PrismaModule],
  controllers: [CustomersController, CustomerSelfFinancialController, CustomersFinancialController],
  providers: [CustomersService, CustomersFinancialService],
  exports: [CustomersService, CustomersFinancialService],
})
export class CustomersModule {}
