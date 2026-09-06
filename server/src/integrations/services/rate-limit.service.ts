// SPEC-014 TASK-006: Distributed Rate Limiting Service

import {
  Inject,
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { TokenStoreService } from '../../token-store/token-store.service.js';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
  window: number;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly memoryLimits = new Map<string, { count: number; resetAt: number }>();

  constructor(@Inject(TokenStoreService) private readonly tokenStore: TokenStoreService) {}

  async checkRateLimit(
    key: string,
    limit: number,
    windowMs: number,
    burstCapacity?: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowKey = `ratelimit:${key}:${Math.floor(now / windowMs)}`;
    const resetAt = Math.ceil(now / windowMs) * windowMs;
    const reset = Math.ceil((resetAt - now) / 1000);

    try {
      // Try Redis first
      const currentStr = await this.tokenStore.get(windowKey);
      const current = typeof currentStr === 'string' ? Number.parseInt(currentStr, 10) : 0;

      if (current >= limit) {
        // Check burst capacity
        if (burstCapacity && current < limit + burstCapacity) {
          await this.tokenStore.set(windowKey, (current + 1).toString(), Math.ceil(windowMs / 1000));
          return {
            allowed: true,
            limit: limit + burstCapacity,
            remaining: limit + burstCapacity - current - 1,
            reset,
            window: windowMs,
          };
        }

        return {
          allowed: false,
          limit,
          remaining: 0,
          reset,
          window: windowMs,
        };
      }

      await this.tokenStore.set(windowKey, (current + 1).toString(), Math.ceil(windowMs / 1000));

      return {
        allowed: true,
        limit,
        remaining: limit - current - 1,
        reset,
        window: windowMs,
      };
    } catch (error) {
      // Fallback to memory-based rate limiting
      this.logger.warn(`Redis rate limit failed, using memory fallback: ${error instanceof Error ? error.message : String(error)}`);
      return this.memoryRateLimit(key, limit, windowMs, resetAt, reset);
    }
  }

  async enforceRateLimit(
    key: string,
    limit: number,
    windowMs: number,
    burstCapacity?: number,
  ): Promise<RateLimitResult> {
    const result = await this.checkRateLimit(key, limit, windowMs, burstCapacity);

    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded',
          error: 'Too Many Requests',
          retryAfter: result.reset,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return result;
  }

  private memoryRateLimit(
    key: string,
    limit: number,
    windowMs: number,
    resetAt: number,
    reset: number,
  ): RateLimitResult {
    const now = Date.now();
    const entry = this.memoryLimits.get(key);

    if (!entry || entry.resetAt <= now) {
      this.memoryLimits.set(key, { count: 1, resetAt });
      return { allowed: true, limit, remaining: limit - 1, reset, window: windowMs };
    }

    if (entry.count >= limit) {
      return { allowed: false, limit, remaining: 0, reset, window: windowMs };
    }

    entry.count++;
    return { allowed: true, limit, remaining: limit - entry.count, reset, window: windowMs };
  }

  getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.reset.toString(),
      'X-RateLimit-Window': result.window.toString(),
    };
  }
}
