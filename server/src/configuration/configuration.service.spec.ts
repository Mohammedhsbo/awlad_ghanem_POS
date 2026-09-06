import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigurationService } from './configuration.service';
import { ConfigurationCacheService } from './configuration-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigScope } from './configuration.types';
import { NotFoundException } from '@nestjs/common';

describe('ConfigurationService', () => {
  let service: ConfigurationService;
  let prisma: PrismaService;
  let cache: ConfigurationCacheService;

  const mockPrisma = {
    systemConfiguration: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    companyConfiguration: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    branchConfiguration: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  };

  const mockCache = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    invalidatePattern: vi.fn(),
    invalidateAll: vi.fn(),
    invalidateBranch: vi.fn(),
    invalidateCompany: vi.fn(),
    invalidateSystem: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigurationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigurationCacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<ConfigurationService>(ConfigurationService);
    prisma = module.get<PrismaService>(PrismaService);
    cache = module.get<ConfigurationCacheService>(ConfigurationCacheService);

    vi.clearAllMocks();
  });

  describe('getValue', () => {
    it('should return cached value if available', async () => {
      const cacheKey = 'config:resolved:global:test.key';
      mockCache.get.mockResolvedValue('cached-value');

      const result = await service.getValue('test.key');

      expect(result).toBe('cached-value');
      expect(mockCache.get).toHaveBeenCalledWith(cacheKey);
      expect(mockPrisma.branchConfiguration.findFirst).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache if not in cache', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.systemConfiguration.findUnique.mockResolvedValue({
        dataType: 'string',
      });
      mockPrisma.branchConfiguration.findFirst.mockResolvedValue(null);
      mockPrisma.companyConfiguration.findFirst.mockResolvedValue(null);
      mockPrisma.systemConfiguration.findFirst.mockResolvedValue({
        configKey: 'test.key',
        configValue: 'system-value',
        dataType: 'string',
        isActive: true,
        updatedAt: new Date(),
      });

      const result = await service.getValue('test.key');

      expect(result).toBe('system-value');
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should throw NotFoundException if key not found', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.systemConfiguration.findUnique.mockResolvedValue({
        dataType: 'string',
      });
      mockPrisma.branchConfiguration.findFirst.mockResolvedValue(null);
      mockPrisma.companyConfiguration.findFirst.mockResolvedValue(null);
      mockPrisma.systemConfiguration.findFirst.mockResolvedValue(null);

      await expect(service.getValue('nonexistent.key')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getValueWithMeta - hierarchy resolution', () => {
    const branchId = 'branch-123';

    it('should return branch-level config if exists and not inheriting', async () => {
      mockPrisma.branchConfiguration.findFirst.mockResolvedValue({
        configKey: 'test.key',
        configValue: 'branch-value',
        inheritsFromCompany: false,
        updatedAt: new Date(),
        creator: { id: 'user-1', name: 'Test User' },
      });

      const result = await service.getValueWithMeta('test.key', branchId);

      expect(result.value).toBe('branch-value');
      expect(result.source).toBe(ConfigScope.BRANCH);
      expect(mockPrisma.companyConfiguration.findFirst).not.toHaveBeenCalled();
    });

    it('should skip to company level if branch inherits', async () => {
      mockPrisma.branchConfiguration.findFirst.mockResolvedValue({
        configKey: 'test.key',
        configValue: 'branch-value',
        inheritsFromCompany: true,
      });
      mockPrisma.companyConfiguration.findFirst.mockResolvedValue({
        configKey: 'test.key',
        configValue: 'company-value',
        version: 1,
        isActive: true,
        updatedAt: new Date(),
        creator: { id: 'user-1', name: 'Test User' },
      });

      const result = await service.getValueWithMeta('test.key', branchId);

      expect(result.value).toBe('company-value');
      expect(result.source).toBe(ConfigScope.COMPANY);
    });

    it('should fallback to system level if company not found', async () => {
      mockPrisma.branchConfiguration.findFirst.mockResolvedValue(null);
      mockPrisma.companyConfiguration.findFirst.mockResolvedValue(null);
      mockPrisma.systemConfiguration.findFirst.mockResolvedValue({
        configKey: 'test.key',
        configValue: 'system-value',
        isActive: true,
        updatedAt: new Date(),
      });

      const result = await service.getValueWithMeta('test.key', branchId);

      expect(result.value).toBe('system-value');
      expect(result.source).toBe(ConfigScope.SYSTEM);
    });

    it('should throw if config not found at any level', async () => {
      mockPrisma.branchConfiguration.findFirst.mockResolvedValue(null);
      mockPrisma.companyConfiguration.findFirst.mockResolvedValue(null);
      mockPrisma.systemConfiguration.findFirst.mockResolvedValue(null);

      await expect(
        service.getValueWithMeta('nonexistent.key', branchId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAllConfiguration', () => {
    it('should return all system configurations', async () => {
      const configs = [
        { configKey: 'key1', configValue: 'value1', dataType: 'string' },
        { configKey: 'key2', configValue: '42', dataType: 'number' },
      ];
      mockPrisma.systemConfiguration.findMany.mockResolvedValue(configs);

      const result = await service.getAllConfiguration(ConfigScope.SYSTEM);

      expect(result).toEqual({
        key1: 'value1',
        key2: 42,
      });
    });

    it('should return unique company configurations by version', async () => {
      const configs = [
        {
          configKey: 'key1',
          configValue: 'value-v2',
          dataType: 'string',
          version: 2,
          isActive: true,
        },
        {
          configKey: 'key1',
          configValue: 'value-v1',
          dataType: 'string',
          version: 1,
          isActive: true,
        },
        {
          configKey: 'key2',
          configValue: 'other',
          dataType: 'string',
          version: 1,
          isActive: true,
        },
      ];
      mockPrisma.companyConfiguration.findMany.mockResolvedValue(configs);

      const result = await service.getAllConfiguration(ConfigScope.COMPANY);

      expect(result).toEqual({
        key1: 'value-v2',
        key2: 'other',
      });
    });

    it('should return branch configurations', async () => {
      const configs = [
        { configKey: 'key1', configValue: 'branch-value', dataType: 'string' },
      ];
      mockPrisma.branchConfiguration.findMany.mockResolvedValue(configs);

      const result = await service.getAllConfiguration(
        ConfigScope.BRANCH,
        'branch-123',
      );

      expect(result).toEqual({
        key1: 'branch-value',
      });
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate all cache if no keys specified', async () => {
      await service.invalidateCache();

      expect(mockCache.invalidateAll).toHaveBeenCalled();
    });

    it('should invalidate specific keys for specific branch', async () => {
      await service.invalidateCache(['key1', 'key2'], 'branch-123');

      expect(mockCache.delete).toHaveBeenCalledWith([
        'config:resolved:branch-123:key1',
        'config:resolved:branch-123:key2',
      ]);
    });

    it('should invalidate patterns for all branches if no branchId', async () => {
      await service.invalidateCache(['key1']);

      expect(mockCache.invalidatePattern).toHaveBeenCalledWith(
        'config:resolved:*:key1',
      );
    });
  });
});
