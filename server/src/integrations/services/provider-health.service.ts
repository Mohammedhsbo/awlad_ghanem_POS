// SPEC-014 TASK-008: Provider Health & Monitoring Service

import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ProviderRegistry } from '../providers/provider.registry.js';
import { HealthStatus } from '@prisma/client';
import { TokenStoreService } from '../../token-store/token-store.service.js';

@Injectable()
export class ProviderHealthService {
  private readonly logger = new Logger(ProviderHealthService.name);
  private readonly HEALTH_CACHE_TTL = 60; // 60 seconds

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProviderRegistry) private readonly providerRegistry: ProviderRegistry,
    @Inject(TokenStoreService) private readonly tokenStore: TokenStoreService,
  ) {}

  async checkIntegrationHealth(integrationId: string): Promise<HealthStatus> {
    const cacheKey = `health:${integrationId}`;

    try {
      const cached = await this.tokenStore.get(cacheKey);
      if (cached) {
        return cached as HealthStatus;
      }
    } catch (error) {
      // Continue without cache
    }

    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
      include: { provider: true },
    });

    if (!integration || !integration.isEnabled) {
      return HealthStatus.unknown;
    }

    try {
      const provider = this.providerRegistry.getProvider(integration.provider.providerKey);
      const config = JSON.parse(JSON.stringify(integration.configuration));
      
      await provider.initialize(config);
      const healthResult = await provider.healthCheck();

      let status: HealthStatus;
      if (healthResult.status === 'healthy') {
        status = HealthStatus.healthy;
      } else if (healthResult.status === 'degraded') {
        status = HealthStatus.degraded;
      } else if (healthResult.status === 'unhealthy') {
        status = HealthStatus.unhealthy;
      } else {
        status = HealthStatus.unknown;
      }

      // Update database
      await this.prisma.integration.update({
        where: { id: integrationId },
        data: {
          healthStatus: status,
          lastHealthCheck: new Date(),
          lastError: healthResult.lastError || null,
          consecutiveFailures: status === HealthStatus.healthy ? 0 : integration.consecutiveFailures + 1,
        },
      });

      // Cache result
      try {
        await this.tokenStore.set(cacheKey, status, this.HEALTH_CACHE_TTL);
      } catch (error) {
        // Cache failure is non-critical
      }

      return status;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Health check failed for integration ${integrationId}: ${errorMessage}`);

      await this.prisma.integration.update({
        where: { id: integrationId },
        data: {
          healthStatus: HealthStatus.unhealthy,
          lastHealthCheck: new Date(),
          lastError: errorMessage,
          consecutiveFailures: { increment: 1 },
        },
      });

      return HealthStatus.unhealthy;
    }
  }

  async getIntegrationMetrics(integrationId: string, hours: number = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const logs = await this.prisma.integrationLog.findMany({
      where: {
        integrationId,
        createdAt: { gte: since },
      },
      select: {
        responseStatus: true,
        duration: true,
        errorCode: true,
        createdAt: true,
      },
    });

    const total = logs.length;
    const successful = logs.filter((l) => l.responseStatus && l.responseStatus >= 200 && l.responseStatus < 300).length;
    const failed = logs.filter((l) => !l.responseStatus || l.responseStatus >= 400).length;

    const durations = logs.filter((l) => l.duration).map((l) => l.duration!);
    const avgResponseTime = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    // Calculate p95
    const sortedDurations = durations.sort((a, b) => a - b);
    const p95Index = Math.floor(sortedDurations.length * 0.95);
    const p95ResponseTime = sortedDurations[p95Index] || 0;

    return {
      totalRequests: total,
      successfulRequests: successful,
      failedRequests: failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      errorRate: total > 0 ? (failed / total) * 100 : 0,
      avgResponseTime: Math.round(avgResponseTime),
      p95ResponseTime: Math.round(p95ResponseTime),
    };
  }

  async getSystemHealthOverview() {
    const integrations = await this.prisma.integration.findMany({
      where: { isEnabled: true },
      include: {
        provider: {
          select: {
            providerKey: true,
            providerName: true,
            category: true,
          },
        },
      },
    });

    const healthy = integrations.filter((i) => i.healthStatus === HealthStatus.healthy).length;
    const degraded = integrations.filter((i) => i.healthStatus === HealthStatus.degraded).length;
    const unhealthy = integrations.filter((i) => i.healthStatus === HealthStatus.unhealthy).length;
    const unknown = integrations.filter((i) => i.healthStatus === HealthStatus.unknown).length;

    // Get pending webhooks
    const pendingWebhooks = await this.prisma.integrationWebhookEvent.count({
      where: {
        status: { in: ['pending', 'processing'] },
      },
    });

    return {
      totalIntegrations: integrations.length,
      healthy,
      degraded,
      unhealthy,
      unknown,
      pendingWebhooks,
      integrations: integrations.map((i) => ({
        id: i.id,
        name: i.integrationName,
        provider: i.provider.providerName,
        category: i.provider.category,
        status: i.healthStatus,
        lastCheck: i.lastHealthCheck,
        consecutiveFailures: i.consecutiveFailures,
      })),
    };
  }

  async checkAlerts() {
    const alerts = [];
    const since15Min = new Date(Date.now() - 15 * 60 * 1000);

    const integrations = await this.prisma.integration.findMany({
      where: { isEnabled: true },
      include: { provider: true },
    });

    for (const integration of integrations) {
      // Check failure rate
      const metrics = await this.getIntegrationMetrics(integration.id, 0.25); // Last 15 minutes
      
      if (metrics.errorRate > 5 && metrics.totalRequests > 10) {
        alerts.push({
          type: 'high_error_rate',
          integrationId: integration.id,
          integrationName: integration.integrationName,
          provider: integration.provider.providerName,
          message: `Error rate ${metrics.errorRate.toFixed(2)}% exceeds 5% threshold`,
          severity: 'warning',
        });
      }

      // Check p95 response time
      if (metrics.p95ResponseTime > 2000) {
        alerts.push({
          type: 'slow_response',
          integrationId: integration.id,
          integrationName: integration.integrationName,
          provider: integration.provider.providerName,
          message: `P95 response time ${metrics.p95ResponseTime}ms exceeds 2000ms threshold`,
          severity: 'warning',
        });
      }

      // Check consecutive failures
      if (integration.consecutiveFailures >= 3) {
        alerts.push({
          type: 'consecutive_failures',
          integrationId: integration.id,
          integrationName: integration.integrationName,
          provider: integration.provider.providerName,
          message: `${integration.consecutiveFailures} consecutive health check failures`,
          severity: 'critical',
        });
      }
    }

    // Check pending webhooks
    const pendingWebhooks = await this.prisma.integrationWebhookEvent.count({
      where: {
        status: { in: ['pending', 'failed'] },
      },
    });

    if (pendingWebhooks > 100) {
      alerts.push({
        type: 'webhook_backlog',
        message: `${pendingWebhooks} pending webhook events exceeds 100 threshold`,
        severity: 'warning',
      });
    }

    return alerts;
  }
}
