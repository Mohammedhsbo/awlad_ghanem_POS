// SPEC-014: Inbound Webhook Controller

import {
  Inject,
  Controller,
  Post,
  Param,
  Body,
  Headers,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { WebhookService } from '../services/webhook.service.js';
import { RateLimitService } from '../services/rate-limit.service.js';
import { APIResponseInterceptor } from '../interceptors/api-response.interceptor.js';

@Controller('webhooks')
@UseInterceptors(APIResponseInterceptor)
export class WebhookInboundController {
  constructor(
    @Inject(WebhookService) private readonly webhookService: WebhookService,
    @Inject(RateLimitService) private readonly rateLimitService: RateLimitService,
  ) {}

  @Post(':providerKey/:integrationId')
  async receiveWebhook(
    @Param('providerKey') providerKey: string,
    @Param('integrationId') integrationId: string,
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
  ) {
    // Rate limit per integration
    await this.rateLimitService.enforceRateLimit(
      `webhook:${integrationId}`,
      100, // 100 requests
      60000, // per minute
    );

    // Validate payload size
    const payloadStr = JSON.stringify(payload);
    if (payloadStr.length > 1048576) {
      // 1MB limit
      throw new BadRequestException('Webhook payload too large');
    }

    // Process webhook
    return this.webhookService.processWebhook(
      providerKey,
      integrationId,
      payload,
      headers,
    );
  }
}
