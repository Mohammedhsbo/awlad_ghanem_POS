import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PurchasesService } from '../src/purchases/purchases.service.js';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';

describe('PurchasesService', () => {
  let service: PurchasesService;
  let prismaMock: any;
  let auditMock: any;

  beforeEach(() => {
    prismaMock = {
      supplier: {
        findUnique: vi.fn(),
      },
      branch: {
        findUnique: vi.fn(),
      },
      purchase: {
        findFirst: vi.fn().mockResolvedValue(null), // For generatePurchaseNumber
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      purchaseItem: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation((cb) => cb(prismaMock)),
    };

    auditMock = {
      log: vi.fn(),
    };

    service = new PurchasesService(prismaMock as any, auditMock as any);
  });

  describe('create', () => {
    it('should calculate totalAmount properly based on items', async () => {
      prismaMock.supplier.findUnique.mockResolvedValue({ id: 's1', isActive: true });
      prismaMock.branch.findUnique.mockResolvedValue({ id: 'b1', nameEn: 'Riyadh' });
      
      const createdPurchase = { id: 'p1', totalAmount: 0 };
      prismaMock.purchase.create.mockImplementation((args: any) => {
        createdPurchase.totalAmount = args.data.totalAmount;
        return createdPurchase;
      });

      const req = {
        supplierId: 's1',
        branchId: 'b1',
        items: [
          { model: 'Bike1', quantity: 2, unitCost: 1000 },
          { model: 'Bike2', quantity: 1, unitCost: 5000 },
        ],
      };

      await service.create(req, 'u1', 'b1', false);
      expect(createdPurchase.totalAmount).toBe(7000);
    });

    it('should enforce branch scope for non-admins', async () => {
      const req = { supplierId: 's1', branchId: 'b2', items: [] };
      await expect(service.create(req, 'u1', 'b1', false)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should fail if purchase is not in draft status', async () => {
      // Mock findOne indirectly by mocking findUnique for the findOne call
      prismaMock.purchase.findUnique.mockResolvedValue({ 
        id: 'p1', 
        status: 'ordered', 
        branchId: 'b1',
        supplier: {}, branch: {}, items: [] 
      });

      await expect(service.update('p1', {}, 'u1', 'b1', false)).rejects.toThrow(ConflictException);
    });

    it('should successfully update and recalculate total if in draft', async () => {
      prismaMock.purchase.findUnique.mockResolvedValue({ 
        id: 'p1', 
        status: 'draft', 
        branchId: 'b1',
        totalAmount: 100,
        supplier: { isActive: true }, branch: {}, items: [] 
      });
      prismaMock.supplier.findUnique.mockResolvedValue({ id: 's1', isActive: true });
      prismaMock.purchase.update.mockResolvedValue({ id: 'p1' });

      await service.update('p1', {
        supplierId: 's1',
        items: [{ model: 'Bike', quantity: 3, unitCost: 1000 }]
      }, 'u1', 'b1', false);

      expect(prismaMock.purchaseItem.deleteMany).toHaveBeenCalled();
      expect(prismaMock.purchaseItem.createMany).toHaveBeenCalled();
      
      const updateCall = prismaMock.purchase.update.mock.calls[0][0];
      expect(updateCall.data.totalAmount).toBe(3000);
    });
  });

  describe('order (status transition)', () => {
    it('should transition draft to ordered', async () => {
      prismaMock.purchase.findUnique.mockResolvedValue({ 
        id: 'p1', 
        status: 'draft', 
        branchId: 'b1',
        items: [{ id: 'i1' }]
      });

      prismaMock.purchase.update.mockResolvedValue({ id: 'p1', status: 'ordered' });

      await service.order('p1', 'u1', 'b1', false);

      const updateCall = prismaMock.purchase.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('ordered');
      expect(auditMock.log).toHaveBeenCalled();
    });

    it('should fail if no items', async () => {
      prismaMock.purchase.findUnique.mockResolvedValue({ 
        id: 'p1', 
        status: 'draft', 
        branchId: 'b1',
        items: [] // No items
      });

      await expect(service.order('p1', 'u1', 'b1', false)).rejects.toThrow(/no items/i);
    });

    it('should fail if not in draft', async () => {
      prismaMock.purchase.findUnique.mockResolvedValue({ 
        id: 'p1', 
        status: 'partially_received', 
        branchId: 'b1',
        items: [{ id: 'i1' }]
      });

      await expect(service.order('p1', 'u1', 'b1', false)).rejects.toThrow(ConflictException);
    });
  });

  describe('cancel (status transition)', () => {
    it('should transition draft to cancelled', async () => {
      prismaMock.purchase.findUnique.mockResolvedValue({ 
        id: 'p1', 
        status: 'draft', 
        branchId: 'b1'
      });

      await service.cancel('p1', 'u1', 'b1', false);

      const updateCall = prismaMock.purchase.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('cancelled');
    });

    it('should fail if not in draft', async () => {
      prismaMock.purchase.findUnique.mockResolvedValue({ 
        id: 'p1', 
        status: 'ordered', 
        branchId: 'b1'
      });

      await expect(service.cancel('p1', 'u1', 'b1', false)).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should allow deletion of draft purchase with no received items', async () => {
      prismaMock.purchase.findUnique.mockResolvedValue({ 
        id: 'p1', 
        status: 'draft', 
        branchId: 'b1',
        items: [] // Length 0 means no received items (because of our query filter)
      });

      await service.remove('p1', 'u1', 'b1', false);
      expect(prismaMock.purchase.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });

    it('should block deletion if received items exist', async () => {
      prismaMock.purchase.findUnique.mockResolvedValue({ 
        id: 'p1', 
        status: 'draft', 
        branchId: 'b1',
        items: [{ id: 'i1', motorcycleId: 'm1' }] 
      });

      await expect(service.remove('p1', 'u1', 'b1', false)).rejects.toThrow(ConflictException);
    });
  });
});
