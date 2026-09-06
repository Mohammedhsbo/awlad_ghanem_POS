import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigurationAdminService } from './configuration-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigurationService } from './configuration.service';
import { ConfigurationCacheService } from './configuration-cache.service';
import { BadRequestException } from '@nestjs/common';

describe('ConfigurationAdminService', () => {
  let service: ConfigurationAdminService;
  let prisma: PrismaService;

  const mockPrisma = {
    workingHours: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    configurationAudit: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigurationAdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigurationService, useValue: {} },
        { provide: ConfigurationCacheService, useValue: {} },
      ],
    }).compile();

    service = module.get<ConfigurationAdminService>(ConfigurationAdminService);
    prisma = module.get<PrismaService>(PrismaService);
    vi.clearAllMocks();
  });

  it('coerces string page and limit values into Prisma-safe integers', async () => {
    mockPrisma.configurationAudit.findMany.mockResolvedValue([]);
    mockPrisma.configurationAudit.count.mockResolvedValue(0);

    const result = await service.getConfigurationAudit({
      page: '2' as any,
      limit: '10' as any,
    });

    expect(prisma.configurationAudit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      }),
    );
    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 0,
      totalPages: 0,
    });
  });

  it('stores open-day HH:mm values as Prisma-safe DateTimes', async () => {
    mockPrisma.workingHours.findFirst.mockResolvedValue(null);
    mockPrisma.workingHours.create.mockResolvedValue({ id: 'hours-1' });

    await service.updateWorkingHours('branch-1', [{
      dayOfWeek: 1,
      openTime: '09:30',
      closeTime: '18:00',
      isClosed: false,
      effectiveFrom: new Date('2026-01-01'),
    }], 'user-1');

    expect(mockPrisma.workingHours.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        openTime: new Date('1970-01-01T09:30:00.000Z'),
        closeTime: new Date('1970-01-01T18:00:00.000Z'),
        isClosed: false,
      }),
    }));
  });

  it('stores null times for a closed day', async () => {
    mockPrisma.workingHours.findFirst.mockResolvedValue(null);
    mockPrisma.workingHours.create.mockResolvedValue({ id: 'hours-2' });

    await service.updateWorkingHours('branch-1', [{
      dayOfWeek: 5,
      openTime: '',
      closeTime: '',
      isClosed: true,
      effectiveFrom: new Date('2026-01-01'),
    }], 'user-1');

    expect(mockPrisma.workingHours.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ openTime: null, closeTime: null, isClosed: true }),
    }));
  });

  it('rejects malformed time values before creating working hours', async () => {
    await expect(service.updateWorkingHours('branch-1', [{
      dayOfWeek: 1,
      openTime: '9:30',
      closeTime: '18:00',
      effectiveFrom: new Date('2026-01-01'),
    }], 'user-1')).rejects.toBeInstanceOf(BadRequestException);

    expect(mockPrisma.workingHours.create).not.toHaveBeenCalled();
  });

  it('updates the current row when working hours are saved again', async () => {
    const existing = { id: 'hours-1' };
    mockPrisma.workingHours.findFirst.mockResolvedValue(existing);
    mockPrisma.workingHours.update.mockResolvedValue({ id: 'hours-1', isClosed: false });

    await service.updateWorkingHours('branch-1', [{
      dayOfWeek: 1,
      openTime: '10:00',
      closeTime: '19:00',
      isClosed: false,
      effectiveFrom: new Date('2026-01-01'),
    }], 'user-1');

    expect(mockPrisma.workingHours.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'hours-1' },
      data: expect.objectContaining({
        openTime: new Date('1970-01-01T10:00:00.000Z'),
        closeTime: new Date('1970-01-01T19:00:00.000Z'),
      }),
    }));
    expect(mockPrisma.workingHours.create).not.toHaveBeenCalled();
  });
});
