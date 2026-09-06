// SPEC-014: Integration & API Management Module

import { Inject, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TokenStoreModule } from '../token-store/token-store.module.js';
import { AuditModule } from '../audit/audit.module.js';

// Services
import { IntegrationService } from './services/integration.service.js';
import { APIKeyService } from './services/api-key.service.js';
import { RateLimitService } from './services/rate-limit.service.js';
import { IdempotencyService } from './services/idempotency.service.js';
import { WebhookService } from './services/webhook.service.js';
import { ProviderHealthService } from './services/provider-health.service.js';

// Provider Registry
import { ProviderRegistry } from './providers/provider.registry.js';

// Mock Providers
import { MockPaymentProvider } from './providers/mock/mock-payment.provider.js';

// Controllers
import { IntegrationsController } from './controllers/integrations.controller.js';
import { ProvidersController } from './controllers/providers.controller.js';
import { APIKeysController } from './controllers/api-keys.controller.js';
import { WebhooksController } from './controllers/webhooks.controller.js';
import { WebhookInboundController } from './controllers/webhook-inbound.controller.js';

@Module({
  imports: [PrismaModule, TokenStoreModule, AuditModule],
  providers: [
    IntegrationService,
    APIKeyService,
    RateLimitService,
    IdempotencyService,
    WebhookService,
    ProviderHealthService,
    ProviderRegistry,
  ],
  controllers: [
    IntegrationsController,
    ProvidersController,
    APIKeysController,
    WebhooksController,
    WebhookInboundController,
  ],
  exports: [
    IntegrationService,
    APIKeyService,
    RateLimitService,
    IdempotencyService,
    WebhookService,
    ProviderRegistry,
  ],
})
export class IntegrationsModule {
  constructor(@Inject(ProviderRegistry) private readonly providerRegistry: ProviderRegistry) {
    // Register mock providers
    this.providerRegistry?.registerProvider(new MockPaymentProvider());
  }
}
