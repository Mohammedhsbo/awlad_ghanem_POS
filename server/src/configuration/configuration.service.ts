import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigValue, ConfigScope, ConfigMap, ConfigurationMetadata } from './configuration.types.js';
import { ConfigurationCacheService } from './configuration-cache.service.js';

@Injectable()
export class ConfigurationService {
  private readonly logger = new Logger(ConfigurationService.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ConfigurationCacheService) private cacheService: ConfigurationCacheService,
  ) {}

  /**
   * Get configuration value with automatic hierarchy resolution
   * Resolution order: Branch → Company → System → Fallback
   */
  async getValue<T = any>(key: string, branchId?: string): Promise<T> {
    const cacheKey = `config:resolved:${branchId || 'global'}:${key}`;
    
    // Try cache first
    const cached = await this.cacheService.get<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Fetch from database
    const configValue = await this.getValueWithMeta(key, branchId);
    const value = this.parseConfigValue(configValue.value, await this.getDataType(key));
    
    // Store in cache
    await this.cacheService.set(cacheKey, value);
    
    return value as T;
  }

  /**
   * Get configuration value with metadata (source, version, etc.)
   */
  async getValueWithMeta(key: string, branchId?: string): Promise<ConfigValue> {
    // 1. Try branch-level configuration
    if (branchId) {
      const branchConfig = await this.prisma.branchConfiguration.findFirst({
        where: {
          branchId,
          configKey: key,
          isActive: true,
        },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (branchConfig && !branchConfig.inheritsFromCompany) {
        return {
          value: branchConfig.configValue,
          source: ConfigScope.BRANCH,
          lastModified: branchConfig.updatedAt,
          modifiedBy: branchConfig.creator.name,
        };
      }
    }

    // 2. Try company-level configuration
    const companyConfig = await this.prisma.companyConfiguration.findFirst({
      where: {
        configKey: key,
        isActive: true,
        AND: [
          {
            OR: [
              { effectiveFrom: null },
              { effectiveFrom: { lte: new Date() } },
            ],
          },
          {
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: new Date() } },
            ],
          },
        ],
      },
      orderBy: {
        version: 'desc',
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (companyConfig) {
      return {
        value: companyConfig.configValue,
        source: ConfigScope.COMPANY,
        version: companyConfig.version,
        lastModified: companyConfig.updatedAt,
        modifiedBy: companyConfig.creator.name,
      };
    }

    // 3. Try system-level configuration
    const systemConfig = await this.prisma.systemConfiguration.findFirst({
      where: {
        configKey: key,
        isActive: true,
      },
    });

    if (systemConfig) {
      return {
        value: systemConfig.configValue,
        source: ConfigScope.SYSTEM,
        lastModified: systemConfig.updatedAt,
      };
    }

    // 4. Throw if not found
    throw new NotFoundException(`Configuration key "${key}" not found`);
  }

  /**
   * Get all configuration for a scope
   */
  async getAllConfiguration(scope: ConfigScope, branchId?: string): Promise<ConfigMap> {
    const result: ConfigMap = {};

    if (scope === ConfigScope.SYSTEM) {
      const configs = await this.prisma.systemConfiguration.findMany({
        where: { isActive: true },
      });

      for (const config of configs) {
        result[config.configKey] = this.parseConfigValue(config.configValue, config.dataType);
      }
    } else if (scope === ConfigScope.COMPANY) {
      const configs = await this.prisma.companyConfiguration.findMany({
        where: {
          isActive: true,
          OR: [
            { effectiveFrom: null },
            { effectiveFrom: { lte: new Date() } },
          ],
        },
        orderBy: {
          version: 'desc',
        },
      });

      // Get unique keys with highest version
      const uniqueConfigs = new Map<string, any>();
      for (const config of configs) {
        if (!uniqueConfigs.has(config.configKey)) {
          uniqueConfigs.set(config.configKey, config);
        }
      }

      for (const [key, config] of uniqueConfigs) {
        result[key] = this.parseConfigValue(config.configValue, config.dataType);
      }
    } else if (scope === ConfigScope.BRANCH && branchId) {
      const configs = await this.prisma.branchConfiguration.findMany({
        where: {
          branchId,
          isActive: true,
        },
      });

      for (const config of configs) {
        result[config.configKey] = this.parseConfigValue(config.configValue, config.dataType);
      }
    }

    return result;
  }

  /**
   * Invalidate cache for specific keys or all
   */
  async invalidateCache(keys?: string[], branchId?: string): Promise<void> {
    if (!keys) {
      await this.cacheService.invalidateAll();
      this.logger.log('All configuration cache cleared');
      return;
    }

    const cacheKeys: string[] = [];
    for (const key of keys) {
      if (branchId) {
        cacheKeys.push(`config:resolved:${branchId}:${key}`);
      } else {
        // Invalidate for all branches
        await this.cacheService.invalidatePattern(`config:resolved:*:${key}`);
      }
    }

    if (cacheKeys.length > 0) {
      await this.cacheService.delete(cacheKeys);
    }

    this.logger.log(`Cache invalidated for keys: ${keys.join(', ')}`);
  }

  /**
   * Get configuration metadata
   */
  async getMetadata(key: string): Promise<ConfigurationMetadata | null> {
    const systemConfig = await this.prisma.systemConfiguration.findUnique({
      where: { configKey: key },
    });

    if (!systemConfig) {
      return null;
    }

    return {
      key: systemConfig.configKey,
      dataType: systemConfig.dataType as any,
      category: systemConfig.category,
      description: systemConfig.description || undefined,
      isRequired: systemConfig.isRequired,
      defaultValue: systemConfig.defaultValue ? this.parseConfigValue(systemConfig.defaultValue, systemConfig.dataType) : undefined,
      validationRules: systemConfig.validationRules as any,
    };
  }

  /**
   * Get all configuration schema
   */
  async getAllMetadata(): Promise<ConfigurationMetadata[]> {
    const configs = await this.prisma.systemConfiguration.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { configKey: 'asc' }],
    });

    return configs.map((config) => ({
      key: config.configKey,
      dataType: config.dataType as any,
      category: config.category,
      description: config.description || undefined,
      isRequired: config.isRequired,
      defaultValue: config.defaultValue ? this.parseConfigValue(config.defaultValue, config.dataType) : undefined,
      validationRules: config.validationRules as any,
    }));
  }

  /**
   * Parse configuration value based on data type
   */
  private parseConfigValue(value: string, dataType: string): any {
    switch (dataType) {
      case 'number':
        return parseFloat(value);
      case 'boolean':
        return value === 'true' || value === '1';
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      case 'date':
        return new Date(value);
      default:
        return value;
    }
  }

  /**
   * Get data type for a configuration key
   */
  private async getDataType(key: string): Promise<string> {
    const systemConfig = await this.prisma.systemConfiguration.findUnique({
      where: { configKey: key },
      select: { dataType: true },
    });

    return systemConfig?.dataType || 'string';
  }
}
