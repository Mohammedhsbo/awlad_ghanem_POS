import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller.js";
import { WebhookController } from "./webhook.controller.js";
import { PaymentsService } from "./payments.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { PaymentProviderRegistry } from "./providers/payment-provider.registry.js";
import { WebhookProcessorService } from "./providers/webhook-processor.service.js";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PaymentsController, WebhookController],
  providers: [
    PaymentsService,
    PaymentProviderRegistry,
    WebhookProcessorService,
  ],
  exports: [
    PaymentsService,
    PaymentProviderRegistry,
    WebhookProcessorService,
  ],
})
export class PaymentsModule {}
