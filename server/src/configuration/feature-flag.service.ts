import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigurationCacheService } from './configuration-cache.service.js';
import { createHash } from 'crypto';

@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ConfigurationCacheService) private cacheService: ConfigurationCacheService,
  ) {}

  /**
   * Check if a feature flag is enabled for a given context
   * Deterministic evaluation based on user/branch ID
   */
  async isFeatureEnabled(
    flagKey: string,
    branchId?: string,
    userId?: string,
  ): Promise<boolean> {
    const cacheKey = `feature:${flagKey}:${branchId || 'global'}:${userId || 'global'}`;
    
    // Try cache first
    const cached = await this.cacheService.get<boolean>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const flag = await this.prisma.featureFlag.findUnique({
      where: { flagKey },
    });

    if (!flag) {
      this.logger.warn(`Feature flag "${flagKey}" not found, defaulting to false`);
      return false;
    }

    if (!flag.isEnabled) {
      await this.cacheService.set(cacheKey, false);
      return false;
    }

    // Check scope-specific targeting
    const isEnabled = this.evaluateFlag(flag, branchId, userId);
    await this.cacheService.set(cacheKey, isEnabled);

    return isEnabled;
  }

  /**
   * Evaluate feature flag based on scope and targeting
   */
  private evaluateFlag(
    flag: any,
    branchId?: string,
    userId?: string,
  ): boolean {
    // System scope: always enabled if flag is enabled
    if (flag.scope === 'system') {
      return true;
    }

    // Branch scope: check target branches
    if (flag.scope === 'branch' && branchId) {
      const targetBranches = flag.targetBranches as string[] | null;
      
      // If no target branches specified, apply rollout percentage
      if (!targetBranches || targetBranches.length === 0) {
        return this.evaluateRolloutPercentage(flag.rolloutPercentage, branchId);
      }

      // Check if branch is in target list
      return targetBranches.includes(branchId);
    }

    // User scope: use rollout percentage with deterministic hash
    if (flag.scope === 'user' && userId) {
      return this.evaluateRolloutPercentage(flag.rolloutPercentage, userId);
    }

    return false;
  }

  /**
   * Deterministic rollout evaluation based on percentage
   * Uses hash of ID to ensure consistent results
   */
  private evaluateRolloutPercentage(percentage: number, id: string): boolean {
    if (percentage === 0) return false;
    if (percentage === 100) return true;

    // Create deterministic hash
    const hash = createHash('md5').update(id).digest('hex');
    const hashValue = parseInt(hash.substring(0, 8), 16);
    const bucket = hashValue % 100;

    return bucket < percentage;
  }

  /**
   * Get all feature flags
   */
  async getAllFlags(scope?: string, enabledOnly?: boolean): Promise<any[]> {
    const where: any = {};

    if (scope) {
      where.scope = scope;
    }

    if (enabledOnly) {
      where.isEnabled = true;
    }

    return this.prisma.featureFlag.findMany({
      where,
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        flagKey: 'asc',
      },
    });
  }

  /**
   * Update feature flag
   */
  async updateFlag(
    flagKey: string,
    update: {
      isEnabled?: boolean;
      rolloutPercentage?: number;
      targetBranches?: string[];
      reason?: string;
    },
    userId: string,
  ): Promise<void> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { flagKey },
    });

    if (!flag) {
      throw new NotFoundException(`Feature flag "${flagKey}" not found`);
    }

    await this.prisma.featureFlag.update({
      where: { flagKey },
      data: {
        isEnabled: update.isEnabled ?? flag.isEnabled,
        rolloutPercentage: update.rolloutPercentage ?? flag.rolloutPercentage,
        targetBranches: (update.targetBranches ?? flag.targetBranches) as any,
        updatedAt: new Date(),
      },
    });

    // Audit the change
    await this.prisma.configurationAudit.create({
      data: {
        configType: 'feature_flag',
        configKey: flagKey,
        previousValue: JSON.stringify({
          isEnabled: flag.isEnabled,
          rolloutPercentage: flag.rolloutPercentage,
          targetBranches: flag.targetBranches,
        }),
        newValue: JSON.stringify({
          isEnabled: update.isEnabled ?? flag.isEnabled,
          rolloutPercentage: update.rolloutPercentage ?? flag.rolloutPercentage,
          targetBranches: update.targetBranches ?? flag.targetBranches,
        }),
        changeReason: update.reason,
        changedBy: userId,
      },
    });

    // Invalidate cache
    await this.cacheService.invalidateFeatureFlag(flagKey);

    this.logger.log(`Feature flag "${flagKey}" updated`);
  }

  /**
   * Create feature flag
   */
  async createFlag(
    data: {
      flagKey: string;
      flagName: string;
      description?: string;
      scope: string;
      isEnabled?: boolean;
      rolloutPercentage?: number;
      targetBranches?: string[];
      environment?: string;
    },
    userId: string,
  ): Promise<any> {
    return this.prisma.featureFlag.create({
      data: {
        flagKey: data.flagKey,
        flagName: data.flagName,
        description: data.description,
        scope: data.scope as any,
        isEnabled: data.isEnabled ?? false,
        rolloutPercentage: data.rolloutPercentage ?? 0,
        targetBranches: data.targetBranches as any,
        environment: data.environment || 'production',
        createdBy: userId,
      },
    });
  }

  /**
   * Invalidate cache for a specific flag
   */
  async invalidateCache(flagKey?: string): Promise<void> {
    if (!flagKey) {
      await this.cacheService.invalidatePattern('feature:*');
      this.logger.log('All feature flag cache cleared');
      return;
    }

    await this.cacheService.invalidateFeatureFlag(flagKey);
    this.logger.log(`Feature flag cache invalidated for: ${flagKey}`);
  }
}
