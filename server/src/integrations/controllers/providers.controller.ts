// SPEC-014: Providers Controller

import {
  Inject,
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RequirePermission } from '../../auth/decorators/permissions.decorator.js';
import { Resource, Action } from '@motorcycle-system/shared-types';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ProviderRegistry } from '../providers/provider.registry.js';
import { ProviderHealthService } from '../services/provider-health.service.js';
import { APIResponseInterceptor } from '../interceptors/api-response.interceptor.js';

@Controller('admin/providers')
@UseGuards(JwtAuthGuard)
@UseInterceptors(APIResponseInterceptor)
export class ProvidersController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProviderRegistry) private readonly providerRegistry: ProviderRegistry,
    @Inject(ProviderHealthService) private readonly healthService: ProviderHealthService,
  ) {}

  @Get()
  @RequirePermission(Resource.SETTING, Action.READ)
  async listProviders() {
    const providers = await this.prisma.externalProvider.findMany({
      include: {
        _count: {
          select: { integrations: true },
        },
      },
      orderBy: { providerName: 'asc' },
    });

    return providers.map((p) => ({
      ...p,
      integrationCount: p._count.integrations,
      isRegistered: this.providerRegistry.hasProvider(p.providerKey),
    }));
  }

  @Patch(':key/toggle')
  @RequirePermission(Resource.SETTING, Action.UPDATE)
  async toggleProvider(@Param('key') key: string) {
    const provider = await this.prisma.externalProvider.findUnique({
      where: { providerKey: key },
    });

    if (!provider) {
      throw new Error('Provider not found');
    }

    const updated = await this.prisma.externalProvider.update({
      where: { providerKey: key },
      data: { isEnabled: !provider.isEnabled },
    });

    return updated;
  }

  @Get(':key/health')
  @RequirePermission(Resource.SETTING, Action.READ)
  async getProviderHealth(@Param('key') key: string) {
    const integrations = await this.prisma.integration.findMany({
      where: {
        provider: { providerKey: key },
        isEnabled: true,
      },
    });

    const healthChecks = await Promise.all(
      integrations.map((i) => this.healthService.checkIntegrationHealth(i.id)),
    );

    const healthy = healthChecks.filter((h) => h === 'healthy').length;
    const total = healthChecks.length;

    return {
      providerKey: key,
      totalIntegrations: total,
      healthyIntegrations: healthy,
      healthPercentage: total > 0 ? (healthy / total) * 100 : 0,
      integrations: integrations.map((i, idx) => ({
        id: i.id,
        name: i.integrationName,
        status: healthChecks[idx],
      })),
    };
  }

  @Get(':key/metrics')
  @RequirePermission(Resource.SETTING, Action.READ)
  async getProviderMetrics(@Param('key') key: string) {
    const integrations = await this.prisma.integration.findMany({
      where: {
        provider: { providerKey: key },
        isEnabled: true,
      },
    });

    const metricsPromises = integrations.map((i) =>
      this.healthService.getIntegrationMetrics(i.id, 24),
    );
    const metrics = await Promise.all(metricsPromises);

    const aggregate = metrics.reduce(
      (acc, m) => ({
        totalRequests: acc.totalRequests + m.totalRequests,
        successfulRequests: acc.successfulRequests + m.successfulRequests,
        failedRequests: acc.failedRequests + m.failedRequests,
        avgResponseTime: acc.avgResponseTime + m.avgResponseTime,
      }),
      { totalRequests: 0, successfulRequests: 0, failedRequests: 0, avgResponseTime: 0 },
    );

    const count = metrics.length || 1;

    return {
      providerKey: key,
      totalRequests: aggregate.totalRequests,
      successfulRequests: aggregate.successfulRequests,
      failedRequests: aggregate.failedRequests,
      successRate:
        aggregate.totalRequests > 0
          ? (aggregate.successfulRequests / aggregate.totalRequests) * 100
          : 0,
      avgResponseTime: Math.round(aggregate.avgResponseTime / count),
    };
  }
}
