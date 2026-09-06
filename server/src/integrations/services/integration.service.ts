// SPEC-014: Integration Service

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { HealthStatus } from '@prisma/client';

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getIntegration(id: string) {
    const integration = await this.prisma.integration.findUnique({
      where: { id },
      include: {
        provider: true,
        branch: true,
        webhookEndpoints: true,
      },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${id} not found`);
    }

    return integration;
  }

  async getIntegrations(branchId?: string, providerId?: string, isEnabled?: boolean) {
    return this.prisma.integration.findMany({
      where: {
        ...(branchId && { branchId }),
        ...(providerId && { providerId }),
        ...(isEnabled !== undefined && { isEnabled }),
      },
      include: {
        provider: true,
        branch: {
          select: {
            id: true,
            nameEn: true,
            nameAr: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateIntegration(
    id: string,
    data: {
      isEnabled?: boolean;
      configuration?: any;
      encryptedSecrets?: string;
    },
    userId: string,
  ) {
    const integration = await this.getIntegration(id);

    const updated = await this.prisma.integration.update({
      where: { id },
      data,
      include: { provider: true },
    });

    // Log audit
    await this.prisma.integrationAudit.create({
      data: {
        integrationId: id,
        action: 'integration.updated',
        previousValue: {
          isEnabled: integration.isEnabled,
          configuration: integration.configuration,
        },
        newValue: {
          isEnabled: updated.isEnabled,
          configuration: updated.configuration,
        },
        changedBy: userId,
      },
    });

    this.logger.log(`Integration ${id} updated by user ${userId}`);
    return updated;
  }

  async updateHealthStatus(
    id: string,
    status: HealthStatus,
    error?: string,
  ) {
    const consecutiveFailures =
      status === HealthStatus.healthy
        ? 0
        : status === HealthStatus.unhealthy
          ? (await this.prisma.integration.findUnique({ where: { id } }))
              ?.consecutiveFailures ?? 0 + 1
          : (await this.prisma.integration.findUnique({ where: { id } }))
              ?.consecutiveFailures ?? 0;

    return this.prisma.integration.update({
      where: { id },
      data: {
        healthStatus: status,
        lastHealthCheck: new Date(),
        lastError: error || null,
        consecutiveFailures,
      },
    });
  }

  async logRequest(data: {
    integrationId: string;
    correlationId: string;
    operation: string;
    direction: 'outbound' | 'inbound';
    requestUrl?: string;
    requestMethod?: string;
    requestBody?: string;
    responseStatus?: number;
    responseBody?: string;
    duration?: number;
    errorCode?: string;
    errorMessage?: string;
    retryAttempt?: number;
  }) {
    // Redact sensitive data
    const redactedData = this.redactSensitiveData(data);

    return this.prisma.integrationLog.create({
      data: redactedData,
    });
  }

  async getIntegrationLogs(
    integrationId: string,
    filters?: {
      operation?: string;
      status?: number;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    },
  ) {
    return this.prisma.integrationLog.findMany({
      where: {
        integrationId,
        ...(filters?.operation && { operation: filters.operation }),
        ...(filters?.status && { responseStatus: filters.status }),
        ...(filters?.startDate && { createdAt: { gte: filters.startDate } }),
        ...(filters?.endDate && { createdAt: { lte: filters.endDate } }),
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 100,
    });
  }

  private redactSensitiveData(data: any): any {
    const sensitiveKeys = [
      'password',
      'secret',
      'token',
      'api_key',
      'apiKey',
      'authorization',
      'card_number',
      'cvv',
      'ssn',
    ];

    const redacted = { ...data };

    if (typeof redacted.requestBody === 'string') {
      try {
        const parsed = JSON.parse(redacted.requestBody);
        redacted.requestBody = JSON.stringify(this.redactObject(parsed, sensitiveKeys));
      } catch {
        // Not JSON, leave as is or apply basic redaction
      }
    }

    if (typeof redacted.responseBody === 'string') {
      try {
        const parsed = JSON.parse(redacted.responseBody);
        redacted.responseBody = JSON.stringify(this.redactObject(parsed, sensitiveKeys));
      } catch {
        // Not JSON
      }
    }

    return redacted;
  }

  private redactObject(obj: any, sensitiveKeys: string[]): any {
    if (typeof obj !== 'object' || obj === null) return obj;

    const redacted: any = Array.isArray(obj) ? [] : {};

    for (const key in obj) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        redacted[key] = this.redactObject(obj[key], sensitiveKeys);
      } else {
        redacted[key] = obj[key];
      }
    }

    return redacted;
  }
}
