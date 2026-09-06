// SPEC-014 TASK-005: Webhook Security & Processing Service

import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { createHmac } from 'crypto';
import { WebhookEventStatus } from '@prisma/client';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly TIMESTAMP_TOLERANCE_MS = 300000; // 5 minutes

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async processWebhook(
    providerKey: string,
    integrationId: string,
    payload: any,
    headers: Record<string, string>,
  ): Promise<{ eventId: string; status: string }> {
    const correlationId = headers['x-correlation-id'] || this.generateCorrelationId();

    // Get integration and webhook endpoint
    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
      include: { provider: true, webhookEndpoints: true },
    });

    if (!integration) {
      throw new BadRequestException('Integration not found');
    }

    if (integration.provider.providerKey !== providerKey) {
      throw new BadRequestException('Provider mismatch');
    }

    const endpoint = integration.webhookEndpoints[0];
    if (!endpoint || !endpoint.isEnabled) {
      throw new BadRequestException('Webhook endpoint not configured');
    }

    // Verify signature
    const signature = headers['x-webhook-signature'] || headers['signature'];
    if (!this.verifySignature(JSON.stringify(payload), signature, endpoint.secret)) {
      this.logger.warn(`Invalid webhook signature for integration ${integrationId}`);
      throw new BadRequestException('Invalid signature');
    }

    // Validate timestamp to prevent replay attacks
    const timestamp = payload.timestamp || headers['x-webhook-timestamp'];
    if (timestamp && !this.validateTimestamp(timestamp)) {
      throw new BadRequestException('Webhook timestamp out of tolerance');
    }

    // Check for duplicate event ID
    const eventId = payload.id || payload.event_id || this.generateEventId();
    const existing = await this.prisma.integrationWebhookEvent.findUnique({
      where: { eventId },
    });

    if (existing) {
      this.logger.log(`Duplicate webhook event ${eventId}, returning cached response`);
      return { eventId, status: existing.status };
    }

    // Persist webhook event
    const webhookEvent = await this.prisma.integrationWebhookEvent.create({
      data: {
        endpointId: endpoint.id,
        eventId,
        eventType: payload.type || payload.event_type || 'unknown',
        payload,
        signature,
        status: WebhookEventStatus.pending,
      },
    });

    // Queue for async processing (in real implementation, use job queue)
    this.processWebhookAsync(webhookEvent.id, integrationId, correlationId).catch((error) => {
      this.logger.error(`Async webhook processing failed: ${error instanceof Error ? error.message : String(error)}`);
    });

    return { eventId, status: 'accepted' };
  }

  private async processWebhookAsync(
    webhookEventId: string,
    integrationId: string,
    correlationId: string,
  ): Promise<void> {
    try {
      await this.prisma.integrationWebhookEvent.update({
        where: { id: webhookEventId },
        data: { status: WebhookEventStatus.processing, lastAttemptAt: new Date() },
      });

      // Log the webhook processing
      await this.prisma.integrationLog.create({
        data: {
          integrationId,
          correlationId,
          operation: 'webhook.received',
          direction: 'inbound',
          responseStatus: 200,
          createdAt: new Date(),
        },
      });

      // Mark as succeeded
      await this.prisma.integrationWebhookEvent.update({
        where: { id: webhookEventId },
        data: {
          status: WebhookEventStatus.succeeded,
          processedAt: new Date(),
          responseStatus: 200,
        },
      });

      this.logger.log(`Webhook event ${webhookEventId} processed successfully`);
    } catch (error) {
      const attempts = await this.incrementAttempts(webhookEventId);

      const errorMessage = error instanceof Error ? error.message : String(error);
      if (attempts >= 5) {
        await this.prisma.integrationWebhookEvent.update({
          where: { id: webhookEventId },
          data: { status: WebhookEventStatus.dead_letter, error: errorMessage },
        });
        this.logger.error(`Webhook event ${webhookEventId} moved to dead letter`);
      } else {
        await this.prisma.integrationWebhookEvent.update({
          where: { id: webhookEventId },
          data: { status: WebhookEventStatus.failed, error: errorMessage },
        });
        this.logger.warn(`Webhook event ${webhookEventId} failed, will retry`);
      }
    }
  }

  private async incrementAttempts(webhookEventId: string): Promise<number> {
    const updated = await this.prisma.integrationWebhookEvent.update({
      where: { id: webhookEventId },
      data: { attempts: { increment: 1 }, lastAttemptAt: new Date() },
    });
    return updated.attempts;
  }

  verifySignature(payload: string, signature: string | undefined, secret: string): boolean {
    if (!signature) return false;

    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Time-safe comparison
    return this.timeSafeEqual(signature, expectedSignature);
  }

  private validateTimestamp(timestamp: string | number): boolean {
    const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
    const now = Date.now();
    const diff = Math.abs(now - ts * 1000);
    return diff <= this.TIMESTAMP_TOLERANCE_MS;
  }

  private timeSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  private generateCorrelationId(): string {
    return `wh_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  async retryFailedWebhooks(limit: number = 10): Promise<number> {
    const failed = await this.prisma.integrationWebhookEvent.findMany({
      where: {
        status: WebhookEventStatus.failed,
        attempts: { lt: 5 },
      },
      take: limit,
      orderBy: { lastAttemptAt: 'asc' },
    });

    for (const event of failed) {
      const endpoint = await this.prisma.webhookEndpoint.findUnique({
        where: { id: event.endpointId },
        include: { integration: true },
      });

      if (endpoint) {
        this.processWebhookAsync(
          event.id,
          endpoint.integration.id,
          this.generateCorrelationId(),
        ).catch(() => {});
      }
    }

    return failed.length;
  }
}
