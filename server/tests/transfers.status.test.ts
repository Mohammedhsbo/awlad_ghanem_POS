import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransfersService } from '../src/transfers/transfers.service.js';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';

describe('TransfersService Status Transitions', () => {
  let service: TransfersService;
  let prismaMock: any;
  let auditMock: any;
  let socketMock: any;

  const TRANSFER_ID = 'trf-001';
  const FROM_BRANCH = 'br-1';
  const TO_BRANCH = 'br-2';
  const USER_ID = 'usr-1';

  beforeEach(() => {
    prismaMock = {
      $queryRaw: vi.fn(),
      transferItem: { findMany: vi.fn() },
      motorcycle: { updateMany: vi.fn() },
      transfer: { update: vi.fn().mockResolvedValue({ id: TRANSFER_ID }) },
      $transaction: vi.fn().mockImplementation((cb) => cb(prismaMock)),
    };
    auditMock = { log: vi.fn() };
    socketMock = { server: { emit: vi.fn() } };

    service = new TransfersService(prismaMock as any, auditMock as any, socketMock as any);
  });

  describe('ship', () => {
    const setupHappyPath = () => {
      // 1. Lock transfer
      prismaMock.$queryRaw.mockResolvedValueOnce([{
        id: TRANSFER_ID, status: 'initiated', fromBranchId: FROM_BRANCH, toBranchId: TO_BRANCH
      }]);
      // 2. Find items
      prismaMock.transferItem.findMany.mockResolvedValue([{ motorcycleId: 'moto-1' }]);
      // 3. Lock motorcycles
      prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'moto-1', status: 'available', branchId: FROM_BRANCH, vin: 'VIN-1' }]);
    };

    it('should successfully ship and emit event', async () => {
      setupHappyPath();

      await service.ship(TRANSFER_ID, USER_ID, FROM_BRANCH, false);

      expect(prismaMock.motorcycle.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['moto-1'] } },
        data: { status: 'in_transfer' },
      });
      expect(prismaMock.transfer.update).toHaveBeenCalledWith({
        where: { id: TRANSFER_ID },
        data: { status: 'in_transit' },
      });
      expect(socketMock.server.emit).toHaveBeenCalledWith('inventory:transfer_shipped', expect.any(Object));
      expect(auditMock.log).toHaveBeenCalled();
    });

    it('should fail if not initiated', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([{
        id: TRANSFER_ID, status: 'in_transit', fromBranchId: FROM_BRANCH, toBranchId: TO_BRANCH
      }]);

      await expect(service.ship(TRANSFER_ID, USER_ID, FROM_BRANCH, false)).rejects.toThrow(ConflictException);
    });

    it('should fail if wrong branch', async () => {
      setupHappyPath();
      await expect(service.ship(TRANSFER_ID, USER_ID, 'wrong-branch', false)).rejects.toThrow(ForbiddenException);
    });

    it('should fail if motorcycle no longer available', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([{
        id: TRANSFER_ID, status: 'initiated', fromBranchId: FROM_BRANCH, toBranchId: TO_BRANCH
      }]);
      prismaMock.transferItem.findMany.mockResolvedValue([{ motorcycleId: 'moto-1' }]);
      // Motorcycle status changed between creation and shipping
      prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'moto-1', status: 'sold', branchId: FROM_BRANCH, vin: 'VIN-1' }]);

      await expect(service.ship(TRANSFER_ID, USER_ID, FROM_BRANCH, false)).rejects.toThrow(ConflictException);
    });
  });

  describe('receive', () => {
    const setupHappyPath = () => {
      // 1. Lock transfer
      prismaMock.$queryRaw.mockResolvedValueOnce([{
        id: TRANSFER_ID, status: 'in_transit', fromBranchId: FROM_BRANCH, toBranchId: TO_BRANCH
      }]);
      // 2. Find items
      prismaMock.transferItem.findMany.mockResolvedValue([{ motorcycleId: 'moto-1' }]);
      // 3. Lock motorcycles
      prismaMock.$queryRaw.mockResolvedValueOnce([{ id: 'moto-1', status: 'in_transfer', vin: 'VIN-1' }]);
    };

    it('should successfully receive, update branch, and emit event', async () => {
      setupHappyPath();

      const result = await service.receive(TRANSFER_ID, USER_ID, TO_BRANCH, false);

      expect(prismaMock.motorcycle.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['moto-1'] } },
        data: { status: 'available', branchId: TO_BRANCH }, // Moves branch and makes available
      });
      expect(prismaMock.transfer.update).toHaveBeenCalledWith({
        where: { id: TRANSFER_ID },
        data: { status: 'received', completedAt: expect.any(Date) },
      });
      expect(socketMock.server.emit).toHaveBeenCalledWith('inventory:transfer_received', expect.any(Object));
      expect(result.motorcycles[0]).toEqual({ id: 'moto-1', vin: 'VIN-1', status: 'available', branchId: TO_BRANCH });
    });

    it('should fail if not in transit', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([{
        id: TRANSFER_ID, status: 'initiated', fromBranchId: FROM_BRANCH, toBranchId: TO_BRANCH
      }]);

      await expect(service.receive(TRANSFER_ID, USER_ID, TO_BRANCH, false)).rejects.toThrow(ConflictException);
    });

    it('should fail if wrong branch receives (e.g. source branch trying to receive)', async () => {
      setupHappyPath();
      // Trying to receive from FROM_BRANCH instead of TO_BRANCH
      await expect(service.receive(TRANSFER_ID, USER_ID, FROM_BRANCH, false)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancel', () => {
    it('should successfully cancel if initiated', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([{
        id: TRANSFER_ID, status: 'initiated', fromBranchId: FROM_BRANCH
      }]);

      await service.cancel(TRANSFER_ID, USER_ID, FROM_BRANCH, false);

      expect(prismaMock.transfer.update).toHaveBeenCalledWith({
        where: { id: TRANSFER_ID },
        data: { status: 'cancelled' },
      });
    });

    it('should fail if already in transit', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([{
        id: TRANSFER_ID, status: 'in_transit', fromBranchId: FROM_BRANCH
      }]);

      await expect(service.cancel(TRANSFER_ID, USER_ID, FROM_BRANCH, false)).rejects.toThrow(ConflictException);
    });
  });
});
