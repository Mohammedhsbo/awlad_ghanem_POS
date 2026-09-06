import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { 
  generatePurchaseNumber, 
  generateTransferNumber,
  generateFinancingContractNumber,
  withUniqueRetry 
} from '../src/utils/number-generator.js';

describe('Number Generator Utilities', () => {
  describe('withUniqueRetry', () => {
    it('should return result if operation succeeds immediately', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const result = await withUniqueRetry(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on P2002 (Unique Constraint) error and succeed', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.0.0',
      });

      const operation = vi.fn()
        .mockRejectedValueOnce(p2002Error)
        .mockRejectedValueOnce(p2002Error)
        .mockResolvedValue('success');

      const result = await withUniqueRetry(operation, 5);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(operation).toHaveBeenNthCalledWith(1, 0);
      expect(operation).toHaveBeenNthCalledWith(2, 1);
      expect(operation).toHaveBeenNthCalledWith(3, 2);
    });

    it('should throw error if max retries exceeded on P2002', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.0.0',
      });

      const operation = vi.fn().mockRejectedValue(p2002Error);

      await expect(withUniqueRetry(operation, 3)).rejects.toThrow(p2002Error);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should retry a serialization failure and rethrow it once retries run out', async () => {
      const serializationError = new Prisma.PrismaClientKnownRequestError(
        'Raw query failed',
        { code: 'P2010', clientVersion: '6.0.0', meta: { code: '40001' } },
      );

      const operation = vi.fn().mockRejectedValue(serializationError);

      await expect(withUniqueRetry(operation, 3)).rejects.toThrow(serializationError);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry on other errors', async () => {
      const otherError = new Error('Some other DB error');
      const operation = vi.fn().mockRejectedValue(otherError);

      await expect(withUniqueRetry(operation, 3)).rejects.toThrow('Some other DB error');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('generatePurchaseNumber', () => {
    it('should start at 00001 if no previous records exist', async () => {
      const prismaMock = {
        purchase: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const result = await generatePurchaseNumber(prismaMock, 'RYD', 2026);
      expect(result).toBe('PO-RYD-2026-00001');
      expect(prismaMock.purchase.findFirst).toHaveBeenCalledWith({
        where: { purchaseNumber: { startsWith: 'PO-RYD-2026-' } },
        orderBy: { purchaseNumber: 'desc' },
        select: { purchaseNumber: true },
      });
    });

    it('should increment the sequence from the last record', async () => {
      const prismaMock = {
        purchase: {
          findFirst: vi.fn().mockResolvedValue({ purchaseNumber: 'PO-RYD-2026-00042' }),
        },
      };

      const result = await generatePurchaseNumber(prismaMock, 'RYD', 2026);
      expect(result).toBe('PO-RYD-2026-00043');
    });

    it('should uppercase the branch code', async () => {
      const prismaMock = {
        purchase: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const result = await generatePurchaseNumber(prismaMock, 'jed', 2026);
      expect(result).toBe('PO-JED-2026-00001');
    });
  });

  describe('generateTransferNumber', () => {
    it('should start at 00001 if no previous records exist', async () => {
      const prismaMock = {
        transfer: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const result = await generateTransferNumber(prismaMock, 2026);
      expect(result).toBe('TRF-2026-00001');
      expect(prismaMock.transfer.findFirst).toHaveBeenCalledWith({
        where: { transferNumber: { startsWith: 'TRF-2026-' } },
        orderBy: { transferNumber: 'desc' },
        select: { transferNumber: true },
      });
    });

    it('should increment the sequence from the last record', async () => {
      const prismaMock = {
        transfer: {
          findFirst: vi.fn().mockResolvedValue({ transferNumber: 'TRF-2026-00999' }),
        },
      };

      const result = await generateTransferNumber(prismaMock, 2026);
      expect(result).toBe('TRF-2026-01000');
    });
  });

  describe('generateFinancingContractNumber', () => {
    it('should start at 00001 if no previous records exist', async () => {
      const prismaMock = {
        financingContract: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const result = await generateFinancingContractNumber(prismaMock, 'RYD', 2026);
      expect(result).toBe('FIN-RYD-2026-00001');
      expect(prismaMock.financingContract.findFirst).toHaveBeenCalledWith({
        where: { contractNumber: { startsWith: 'FIN-RYD-2026-' } },
        orderBy: { contractNumber: 'desc' },
        select: { contractNumber: true },
      });
    });

    it('should increment the sequence from the last record', async () => {
      const prismaMock = {
        financingContract: {
          findFirst: vi.fn().mockResolvedValue({ contractNumber: 'FIN-RYD-2026-00123' }),
        },
      };

      const result = await generateFinancingContractNumber(prismaMock, 'RYD', 2026);
      expect(result).toBe('FIN-RYD-2026-00124');
    });

    it('should uppercase the branch code', async () => {
      const prismaMock = {
        financingContract: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const result = await generateFinancingContractNumber(prismaMock, 'jed', 2026);
      expect(result).toBe('FIN-JED-2026-00001');
    });

    it('should handle large sequence numbers', async () => {
      const prismaMock = {
        financingContract: {
          findFirst: vi.fn().mockResolvedValue({ contractNumber: 'FIN-RYD-2026-99999' }),
        },
      };

      const result = await generateFinancingContractNumber(prismaMock, 'RYD', 2026);
      expect(result).toBe('FIN-RYD-2026-100000');
    });

    it('should use current year by default', async () => {
      const currentYear = new Date().getFullYear();
      const prismaMock = {
        financingContract: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const result = await generateFinancingContractNumber(prismaMock, 'RYD');
      expect(result).toBe(`FIN-RYD-${currentYear}-00001`);
    });
  });
});
