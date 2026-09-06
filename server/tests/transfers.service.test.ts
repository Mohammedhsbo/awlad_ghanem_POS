import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransfersService } from '../src/transfers/transfers.service.js';
import { NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('TransfersService', () => {
  let service: TransfersService;
  let prismaMock: any;
  let auditMock: any;

  beforeEach(() => {
    prismaMock = {
      branch: {
        findUnique: vi.fn(),
      },
      motorcycle: {
        findMany: vi.fn(),
      },
      transferItem: {
        findFirst: vi.fn(),
      },
      transfer: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null), // For generateTransferNumber
      },
      $transaction: vi.fn().mockImplementation((cb) => cb(prismaMock)),
    };

    auditMock = {
      log: vi.fn(),
    };

    service = new TransfersService(prismaMock as any, auditMock as any);
  });

  describe('create', () => {
    const validRequest = {
      fromBranchId: 'branch-1',
      toBranchId: 'branch-2',
      motorcycleIds: ['moto-1', 'moto-2'],
      notes: 'Test transfer',
    };

    beforeEach(() => {
      // Mock successful branch lookup
      prismaMock.branch.findUnique.mockImplementation(({ where: { id } }: any) => {
        if (id === 'branch-1') return Promise.resolve({ id: 'branch-1', nameEn: 'Branch 1' });
        if (id === 'branch-2') return Promise.resolve({ id: 'branch-2', nameEn: 'Branch 2' });
        return Promise.resolve(null);
      });

      // Mock available motorcycles in correct branch
      prismaMock.motorcycle.findMany.mockResolvedValue([
        { id: 'moto-1', vin: 'VIN-01', model: 'Model A', status: 'available', branchId: 'branch-1' },
        { id: 'moto-2', vin: 'VIN-02', model: 'Model B', status: 'available', branchId: 'branch-1' },
      ]);

      // Mock no active transfers
      prismaMock.transferItem.findFirst.mockResolvedValue(null);

      // Mock create successful
      prismaMock.transfer.create.mockResolvedValue({
        id: 'transfer-1',
        transferNumber: 'TRF-2026-00001',
        fromBranchId: 'branch-1',
        toBranchId: 'branch-2',
        userId: 'user-1',
        status: 'initiated',
        items: [
          { motorcycle: { id: 'moto-1', vin: 'VIN-01' } },
          { motorcycle: { id: 'moto-2', vin: 'VIN-02' } },
        ],
      });
    });

    it('should successfully create a transfer', async () => {
      const result = await service.create(validRequest, 'user-1', 'branch-1', false);
      expect(result.transferNumber).toBeDefined();
      expect(prismaMock.transfer.create).toHaveBeenCalled();
      expect(auditMock.log).toHaveBeenCalled();
    });

    it('should fail if user branch scope is violated', async () => {
      await expect(service.create(validRequest, 'user-1', 'branch-3', false)).rejects.toThrow(ForbiddenException);
    });

    it('should allow super admin to create transfer for any branch', async () => {
      await expect(service.create(validRequest, 'user-1', 'branch-3', true)).resolves.toBeDefined();
    });

    it('should fail if from and to branches are the same', async () => {
      const invalidReq = { ...validRequest, toBranchId: 'branch-1' };
      await expect(service.create(invalidReq, 'user-1', 'branch-1', false)).rejects.toThrow(BadRequestException);
    });

    it('should fail if a branch does not exist', async () => {
      prismaMock.branch.findUnique.mockImplementation(({ where: { id } }: any) => {
        if (id === 'branch-1') return Promise.resolve({ id: 'branch-1', nameEn: 'Branch 1' });
        return Promise.resolve(null); // toBranch missing
      });
      await expect(service.create(validRequest, 'user-1', 'branch-1', false)).rejects.toThrow(NotFoundException);
    });

    it('should fail if a motorcycle is not found', async () => {
      prismaMock.motorcycle.findMany.mockResolvedValue([
        { id: 'moto-1', vin: 'VIN-01', model: 'Model A', status: 'available', branchId: 'branch-1' },
      ]); // Missing moto-2
      await expect(service.create(validRequest, 'user-1', 'branch-1', false)).rejects.toThrow(NotFoundException);
    });

    it('should fail if a motorcycle is not available', async () => {
      prismaMock.motorcycle.findMany.mockResolvedValue([
        { id: 'moto-1', vin: 'VIN-01', model: 'Model A', status: 'available', branchId: 'branch-1' },
        { id: 'moto-2', vin: 'VIN-02', model: 'Model B', status: 'sold', branchId: 'branch-1' }, // not available
      ]);
      await expect(service.create(validRequest, 'user-1', 'branch-1', false)).rejects.toThrow(ConflictException);
    });

    it('should fail if a motorcycle is in wrong branch', async () => {
      prismaMock.motorcycle.findMany.mockResolvedValue([
        { id: 'moto-1', vin: 'VIN-01', model: 'Model A', status: 'available', branchId: 'branch-1' },
        { id: 'moto-2', vin: 'VIN-02', model: 'Model B', status: 'available', branchId: 'branch-3' }, // wrong branch
      ]);
      await expect(service.create(validRequest, 'user-1', 'branch-1', false)).rejects.toThrow(ConflictException);
    });

    it('should fail if a motorcycle is already in an active transfer', async () => {
      prismaMock.transferItem.findFirst.mockResolvedValue({ id: 'item-1' });
      await expect(service.create(validRequest, 'user-1', 'branch-1', false)).rejects.toThrow(ConflictException);
    });
  });
});
