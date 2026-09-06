// SPEC-014 TASK-007: Idempotency Service

import { Inject, Injectable, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { createHash } from 'crypto';

export interface IdempotencyResponse {
  responseStatus: number;
  responseHeaders?: any;
  responseBody?: any;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async checkIdempotency(
    idempotencyKey: string,
    scope: string,
    requestHash: string,
  ): Promise<IdempotencyResponse | null> {
    try {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { idempotencyKey },
      });

      if (!existing) {
        return null;
      }

      // Check if expired
      if (existing.expiresAt < new Date()) {
        await this.prisma.idempotencyKey.delete({
          where: { idempotencyKey },
        });
        return null;
      }

      // Check scope matches
      if (existing.scope !== scope) {
        throw new ConflictException(
          'Idempotency key used for different scope',
        );
      }

      // Check if request content matches
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key used with different request content',
        );
      }

      // Return cached response
      return {
        responseStatus: existing.responseStatus,
        responseHeaders: existing.responseHeaders || undefined,
        responseBody: existing.responseBody || undefined,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(`Idempotency check failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async storeIdempotency(
    idempotencyKey: string,
    scope: string,
    requestHash: string,
    response: {
      status: number;
      headers?: any;
      body?: any;
    },
    expiresInSeconds: number = 86400, // 24 hours default
  ): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

      await this.prisma.idempotencyKey.upsert({
        where: { idempotencyKey },
        create: {
          idempotencyKey,
          scope,
          requestHash,
          responseStatus: response.status,
          responseHeaders: response.headers,
          responseBody: JSON.stringify(response.body),
          expiresAt,
        },
        update: {
          responseStatus: response.status,
          responseHeaders: response.headers,
          responseBody: JSON.stringify(response.body),
          expiresAt,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to store idempotency: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  computeRequestHash(request: any): string {
    const content = JSON.stringify({
      method: request.method,
      url: request.url,
      body: request.body,
    });
    return createHash('sha256').update(content).digest('hex');
  }

  async cleanupExpired(): Promise<number> {
    try {
      const result = await this.prisma.idempotencyKey.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });
      return result.count;
    } catch (error) {
      this.logger.error(`Failed to cleanup expired idempotency keys: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }
}
