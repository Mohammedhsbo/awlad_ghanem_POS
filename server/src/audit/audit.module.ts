import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service.js";
import { FinancialAuditService } from "./financial-audit.service.js";

@Global()
@Module({
  providers: [AuditService, FinancialAuditService],
  exports: [AuditService, FinancialAuditService],
})
export class AuditModule {}
