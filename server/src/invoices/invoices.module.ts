import { Module } from "@nestjs/common";
import { InvoicesController } from "./invoices.controller.js";
import { InvoicesService } from "./invoices.service.js";
import { InvoiceIntegrationService } from "./invoice-integration.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceIntegrationService],
  exports: [InvoicesService, InvoiceIntegrationService],
})
export class InvoicesModule {}
