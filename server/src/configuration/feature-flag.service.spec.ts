import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { FeatureFlagService } from './feature-flag.service';
import { ConfigurationCacheService } from './configuration-cache.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FeatureFlagService', () => {
  let service: FeatureFlagService;
  let prisma: PrismaService;
  let cache: ConfigurationCacheService;

  const mockPrisma = {
    featureFlag: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    configurationAudit: {
      create: vi.fn(),
    },
  };

  const mockCache = {
    get: vi.fn(),
    set: vi.fn(),
    invalidateFeatureFlag: vi.fn(),
    invalidatePattern: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureFlagService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigurationCacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<FeatureFlagService>(FeatureFlagService);
    prisma = module.get<PrismaService>(PrismaService);
    cache = module.get<ConfigurationCacheService>(ConfigurationCacheService);

    vi.clearAllMocks();
  });

  describe('isFeatureEnabled', () => {
    it('should return cached value if available', async () => {
      mockCache.get.mockResolvedValue(true);

      const result = await service.isFeatureEnabled('test-flag');

      expect(result).toBe(true);
      expect(mockPrisma.featureFlag.findUnique).not.toHaveBeenCalled();
    });

    it('should return false if flag not found', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

      const result = await service.isFeatureEnabled('nonexistent-flag');

      expect(result).toBe(false);
    });

    it('should return false if flag exists but is disabled', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        flagKey: 'test-flag',
        isEnabled: false,
        scope: 'system',
        rolloutPercentage: 100,
      });

      const result = await service.isFeatureEnabled('test-flag');

      expect(result).toBe(false);
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should return true for system scope when enabled', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        flagKey: 'test-flag',
        isEnabled: true,
        scope: 'system',
        rolloutPercentage: 100,
      });

      const result = await service.isFeatureEnabled('test-flag');

      expect(result).toBe(true);
    });

    it('should check branch targeting for branch scope', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        flagKey: 'test-flag',
        isEnabled: true,
        scope: 'branch',
        rolloutPercentage: 100,
        targetBranches: ['branch-1', 'branch-2'],
      });

      const result1 = await service.isFeatureEnabled(
        'test-flag',
        'branch-1',
        undefined,
      );
      const result2 = await service.isFeatureEnabled(
        'test-flag',
        'branch-3',
        undefined,
      );

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it('should use rollout percentage when no target branches', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        flagKey: 'test-flag',
        isEnabled: true,
        scope: 'branch',
        rolloutPercentage: 0,
        targetBranches: null,
      });

      const result = await service.isFeatureEnabled(
        'test-flag',
        'branch-1',
        undefined,
      );

      expect(result).toBe(false);
    });

    it('should evaluate rollout percentage deterministically for user scope', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        flagKey: 'test-flag',
        isEnabled: true,
        scope: 'user',
        rolloutPercentage: 50,
      });

      // Should return same result for same user
      const result1 = await service.isFeatureEnabled(
        'test-flag',
        undefined,
        'user-1',
      );
      
      mockCache.get.mockResolvedValue(null);
      mockPrisma.featureFlag.findUnique.mockResolvedValue({
        flagKey: 'test-flag',
        isEnabled: true,
        scope: 'user',
        rolloutPercentage: 50,
      });

      const result2 = await service.isFeatureEnabled(
        'test-flag',
        undefined,
        'user-1',
      );

      expect(result1).toBe(result2);
    });
  });

  describe('getAllFlags', () => {
    it('should return all flags without filters', async () => {
      const flags = [
        { flagKey: 'flag1', isEnabled: true },
        { flagKey: 'flag2', isEnabled: false },
      ];
      mockPrisma.featureFlag.findMany.mockResolvedValue(flags);

      const result = await service.getAllFlags();

      expect(result).toEqual(flags);
      expect(mockPrisma.featureFlag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });

    it('should filter by scope', async () => {
      const flags = [{ flagKey: 'flag1', isEnabled: true, scope: 'system' }];
      mockPrisma.featureFlag.findMany.mockResolvedValue(flags);

      await service.getAllFlags('system');

      expect(mockPrisma.featureFlag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { scope: 'system' },
        }),
      );
    });

    it('should filter enabled only', async () => {
      const flags = [{ flagKey: 'flag1', isEnabled: true }];
      mockPrisma.featureFlag.findMany.mockResolvedValue(flags);

      await service.getAllFlags(undefined, true);

      expect(mockPrisma.featureFlag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isEnabled: true },
        }),
      );
    });
  });

  describe('updateFlag', () => {
    it('should update flag and invalidate cache', async () => {
      const existingFlag = {
        flagKey: 'test-flag',
        isEnabled: false,
        rolloutPercentage: 0,
        targetBranches: [],
      };
      mockPrisma.featureFlag.findUnique.mockResolvedValue(existingFlag);
      mockPrisma.featureFlag.update.mockResolvedValue({});
      mockPrisma.configurationAudit.create.mockResolvedValue({});

      await service.updateFlag(
        'test-flag',
        { isEnabled: true, rolloutPercentage: 50 },
        'user-1',
      );

      expect(mockPrisma.featureFlag.update).toHaveBeenCalledWith({
        where: { flagKey: 'test-flag' },
        data: expect.objectContaining({
          isEnabled: true,
          rolloutPercentage: 50,
        }),
      });
      expect(mockPrisma.configurationAudit.create).toHaveBeenCalled();
      expect(mockCache.invalidateFeatureFlag).toHaveBeenCalledWith('test-flag');
    });

    it('should throw NotFoundException if flag does not exist', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

      await expect(
        service.updateFlag('nonexistent', { isEnabled: true }, 'user-1'),
      ).rejects.toThrow();
    });
  });

  describe('createFlag', () => {
    it('should create new feature flag', async () => {
      const flagData = {
        flagKey: 'new-flag',
        flagName: 'New Flag',
        description: 'Test flag',
        scope: 'system',
        isEnabled: false,
      };
      mockPrisma.featureFlag.create.mockResolvedValue(flagData);

      const result = await service.createFlag(flagData, 'user-1');

      expect(result).toEqual(flagData);
      expect(mockPrisma.featureFlag.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          flagKey: 'new-flag',
          flagName: 'New Flag',
        }),
      });
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate all feature flag cache if no key', async () => {
      await service.invalidateCache();

      expect(mockCache.invalidatePattern).toHaveBeenCalledWith('feature:*');
    });

    it('should invalidate specific flag', async () => {
      await service.invalidateCache('test-flag');

      expect(mockCache.invalidateFeatureFlag).toHaveBeenCalledWith('test-flag');
    });
  });
});
