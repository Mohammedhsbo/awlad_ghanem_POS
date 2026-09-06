// SPEC-014 TASK-004: API Key Management Service

import { Inject, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { createHash, randomBytes } from 'crypto';
import { APIKeyScope } from '../types/integration.types.js';

@Injectable()
export class APIKeyService {
  private readonly logger = new Logger(APIKeyService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createAPIKey(data: {
    description?: string;
    scope: APIKeyScope;
    branchId?: string;
    environment?: string;
    expiresAt?: Date;
    createdBy: string;
  }): Promise<{ apiKey: string; keyPrefix: string; id: string }> {
    const environment = data.environment || 'production';
    const prefix = environment === 'production' ? 'api_live_' : 'api_test_';
    
    // Generate cryptographically secure API key
    const randomPart = randomBytes(32).toString('base64url');
    const fullKey = `${prefix}${randomPart}`;
    
    // Hash the full key for storage
    const keyHash = this.hashKey(fullKey);
    
    // Store only prefix for identification
    const keyPrefix = fullKey.substring(0, 12);

    const apiKey = await this.prisma.aPIKey.create({
      data: {
        keyPrefix,
        keyHash,
        description: data.description,
        scope: data.scope as any,
        branchId: data.branchId,
        environment,
        expiresAt: data.expiresAt,
        createdBy: data.createdBy,
      },
    });

    this.logger.log(`API key created: ${keyPrefix}... by user ${data.createdBy}`);

    // Return full key only once
    return {
      apiKey: fullKey,
      keyPrefix,
      id: apiKey.id,
    };
  }

  async validateAPIKey(apiKey: string): Promise<{
    id: string;
    scope: APIKeyScope;
    branchId?: string;
    environment: string;
  }> {
    const keyHash = this.hashKey(apiKey);
    const keyPrefix = apiKey.substring(0, 12);

    const key = await this.prisma.aPIKey.findFirst({
      where: {
        keyHash,
        keyPrefix,
        isActive: true,
      },
    });

    if (!key) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Check expiration
    if (key.expiresAt && key.expiresAt < new Date()) {
      throw new UnauthorizedException('API key expired');
    }

    // Update usage stats
    await this.prisma.aPIKey.update({
      where: { id: key.id },
      data: {
        lastUsedAt: new Date(),
        usageCount: { increment: 1 },
      },
    });

    return {
      id: key.id,
      scope: key.scope as any,
      branchId: key.branchId || undefined,
      environment: key.environment,
    };
  }

  async revokeAPIKey(id: string, userId: string): Promise<void> {
    await this.prisma.aPIKey.update({
      where: { id },
      data: { isActive: false },
    });

    this.logger.log(`API key ${id} revoked by user ${userId}`);
  }

  async listAPIKeys(branchId?: string, environment?: string) {
    return this.prisma.aPIKey.findMany({
      where: {
        ...(branchId && { branchId }),
        ...(environment && { environment }),
        isActive: true,
      },
      select: {
        id: true,
        keyPrefix: true,
        description: true,
        scope: true,
        branchId: true,
        environment: true,
        expiresAt: true,
        lastUsedAt: true,
        usageCount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  checkScope(keyScope: APIKeyScope, requiredResource: string, requiredAction: string): boolean {
    if (keyScope.resources.includes('*')) return true;
    if (!keyScope.resources.includes(requiredResource)) return false;
    if (keyScope.actions.includes('*')) return true;
    return keyScope.actions.includes(requiredAction);
  }

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }
}
