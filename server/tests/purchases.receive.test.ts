import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PurchasesService } from '../src/purchases/purchases.service.js';
import { NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('PurchasesService.receive', () => {
  let service: PurchasesService;
  let prismaMock: any;
  let auditMock: any;
  let socketGatewayMock: any;

  const PURCHASE_ID = 'pur-0000-0000-0000-000000000001';
  const BRANCH_ID = 'bra-0000-0000-0000-000000000001';
  const USER_ID = 'usr-0000-0000-0000-000000000001';
  const ITEM_ID_1 = 'itm-0000-0000-0000-000000000001';
  const ITEM_ID_2 = 'itm-0000-0000-0000-000000000002';

  const makeLockedPurchase = (status = 'ordered') => [
    { id: PURCHASE_ID, status, branchId: BRANCH_ID }
  ];

  const makeLockedItems = (overrides: any[] = []) => [
    {
      id: ITEM_ID_1,
      purchaseId: PURCHASE_ID,
      motorcycleId: null,
      model: 'CBR600RR',
      vin: null,
      quantity: 1,
      unitCost: '38000',
      ...overrides[0],
    },
    {
      id: ITEM_ID_2,
      purchaseId: PURCHASE_ID,
      motorcycleId: null,
      model: 'CBR1000RR',
      vin: null,
      quantity: 1,
      unitCost: '55000',
      ...overrides[1],
    },
  ];

  beforeEach(() => {
    prismaMock = {
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
      category: { findFirst: vi.fn().mockResolvedValue({ id: 'cat-1' }) },
      motorcycle: {
        findUnique: vi.fn().mockResolvedValue(null), // No existing VINs by default
        create: vi.fn().mockImplementation(({ data }: any) => ({
          id: `moto-${data.vin}`,
          vin: data.vin,
          model: data.model,
          status: 'in_transit',
          branchId: data.branchId,
        })),
      },
      purchaseItem: {
        update: vi.fn().mockResolvedValue({}),
        findMany: vi.fn(),
      },
      purchase: {
        update: vi.fn().mockImplementation(({ data }: any) => ({
          id: PURCHASE_ID,
          purchaseNumber: 'PO-MAI-2026-00001',
          status: data.status,
          receivedAt: data.receivedAt ?? null,
        })),
      },
      $queryRaw: vi.fn(),
      $transaction: vi.fn().mockImplementation((cb: any) => cb(prismaMock)),
    };

    auditMock = { log: vi.fn() };
    socketGatewayMock = { server: { emit: vi.fn() } };

    service = new PurchasesService(prismaMock as any, auditMock as any, socketGatewayMock as any);
  });

  const setupHappyPath = (items = makeLockedItems(), status = 'ordered', allReceived = true) => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce(makeLockedPurchase(status)) // Lock purchase
      .mockResolvedValueOnce(items); // Lock items

    // After receiving all items, return all with motorcycleId set
    prismaMock.purchaseItem.findMany.mockResolvedValue(
      allReceived
        ? items.map(i => ({ motorcycleId: `moto-${i.vin || 'new'}` }))
        : [{ motorcycleId: `moto-vin1` }, { motorcycleId: null }]
    );
  };

  it('should successfully receive all items and set status to received', async () => {
    setupHappyPath();

    const result = await service.receive(
      PURCHASE_ID,
      {
        items: [
          { purchaseItemId: ITEM_ID_1, vin: 'VIN-001' },
          { purchaseItemId: ITEM_ID_2, vin: 'VIN-002' },
        ],
      },
      USER_ID,
      BRANCH_ID,
      false,
    );

    expect(result.status).toBe('received');
    expect(result.receivedMotorcycles).toHaveLength(2);
    expect(result.receivedMotorcycles[0].status).toBe('in_transit');
    expect(result.receivedMotorcycles[0].vin).toBe('VIN-001');
    expect(prismaMock.motorcycle.create).toHaveBeenCalledTimes(2);
    // Each motorcycle gets branchId from the purchase
    const createCall = prismaMock.motorcycle.create.mock.calls[0][0].data;
    expect(createCall.branchId).toBe(BRANCH_ID);
    expect(createCall.status).toBe('in_transit');
    expect(createCall.costPrice).toBe('38000');
    expect(auditMock.log).toHaveBeenCalled();
    expect(socketGatewayMock.server.emit).toHaveBeenCalledWith('inventory:purchase_received', expect.any(Object));
  });

  it('should set status to partially_received if only some items received', async () => {
    // Only receive first item
    const items = makeLockedItems();
    prismaMock.$queryRaw
      .mockResolvedValueOnce(makeLockedPurchase('ordered'))
      .mockResolvedValueOnce(items);

    // After receiving: item 1 received, item 2 still null
    prismaMock.purchaseItem.findMany.mockResolvedValue([
      { motorcycleId: 'moto-VIN-001' },
      { motorcycleId: null },
    ]);

    const result = await service.receive(
      PURCHASE_ID,
      { items: [{ purchaseItemId: ITEM_ID_1, vin: 'VIN-001' }] },
      USER_ID,
      BRANCH_ID,
      false,
    );

    expect(result.status).toBe('partially_received');
    expect(result.receivedMotorcycles).toHaveLength(1);
  });

  it('should also allow receiving from partially_received status', async () => {
    setupHappyPath(makeLockedItems(), 'partially_received', true);

    const result = await service.receive(
      PURCHASE_ID,
      {
        items: [
          { purchaseItemId: ITEM_ID_1, vin: 'VIN-001' },
          { purchaseItemId: ITEM_ID_2, vin: 'VIN-002' },
        ],
      },
      USER_ID,
      BRANCH_ID,
      false,
    );

    expect(result.status).toBe('received');
  });

  it('should throw PURCHASE_NOT_FOUND when purchase does not exist', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]); // Empty = not found

    await expect(
      service.receive(PURCHASE_ID, { items: [{ purchaseItemId: ITEM_ID_1, vin: 'VIN-001' }] }, USER_ID, BRANCH_ID, false)
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw PURCHASE_NOT_ORDERED when purchase is in draft status', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce(makeLockedPurchase('draft')) // Wrong status
      .mockResolvedValueOnce(makeLockedItems());

    let caughtError: any;
    try {
      await service.receive(PURCHASE_ID, { items: [{ purchaseItemId: ITEM_ID_1, vin: 'VIN-001' }] }, USER_ID, BRANCH_ID, false);
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.response?.code).toBe('PURCHASE_NOT_ORDERED');
  });

  it('should throw ITEM_ALREADY_RECEIVED when item has motorcycleId', async () => {
    const items = makeLockedItems([{ motorcycleId: 'existing-moto-id' }]); // Item 1 already received
    prismaMock.$queryRaw
      .mockResolvedValueOnce(makeLockedPurchase('ordered'))
      .mockResolvedValueOnce(items);

    await expect(
      service.receive(PURCHASE_ID, { items: [{ purchaseItemId: ITEM_ID_1, vin: 'VIN-001' }] }, USER_ID, BRANCH_ID, false)
    ).rejects.toThrow(ConflictException);

    try {
      prismaMock.$queryRaw
        .mockResolvedValueOnce(makeLockedPurchase('ordered'))
        .mockResolvedValueOnce(items);
      await service.receive(PURCHASE_ID, { items: [{ purchaseItemId: ITEM_ID_1, vin: 'VIN-001' }] }, USER_ID, BRANCH_ID, false);
    } catch (err: any) {
      expect(err.response?.code).toBe('ITEM_ALREADY_RECEIVED');
    }
  });

  it('should throw PURCHASE_ITEM_NOT_FOUND for unknown item ID', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce(makeLockedPurchase('ordered'))
      .mockResolvedValueOnce(makeLockedItems()); // Contains ITEM_ID_1, ITEM_ID_2 only

    await expect(
      service.receive(
        PURCHASE_ID,
        { items: [{ purchaseItemId: 'non-existent-item', vin: 'VIN-001' }] },
        USER_ID,
        BRANCH_ID,
        false,
      )
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw VIN_EXISTS when VIN already exists in database', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce(makeLockedPurchase('ordered'))
      .mockResolvedValueOnce(makeLockedItems());

    // Simulate VIN already in DB
    prismaMock.motorcycle.findUnique.mockResolvedValue({ id: 'existing', vin: 'EXISTING-VIN' });

    await expect(
      service.receive(PURCHASE_ID, { items: [{ purchaseItemId: ITEM_ID_1, vin: 'EXISTING-VIN' }] }, USER_ID, BRANCH_ID, false)
    ).rejects.toThrow(ConflictException);

    try {
      prismaMock.$queryRaw
        .mockResolvedValueOnce(makeLockedPurchase('ordered'))
        .mockResolvedValueOnce(makeLockedItems());
      prismaMock.motorcycle.findUnique.mockResolvedValue({ id: 'existing', vin: 'EXISTING-VIN' });
      await service.receive(PURCHASE_ID, { items: [{ purchaseItemId: ITEM_ID_1, vin: 'EXISTING-VIN' }] }, USER_ID, BRANCH_ID, false);
    } catch (err: any) {
      expect(err.response?.code).toBe('VIN_EXISTS');
    }
  });

  it('should throw VIN_EXISTS on intra-batch duplicate VINs', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce(makeLockedPurchase('ordered'))
      .mockResolvedValueOnce(makeLockedItems());

    await expect(
      service.receive(
        PURCHASE_ID,
        {
          items: [
            { purchaseItemId: ITEM_ID_1, vin: 'SAME-VIN' },
            { purchaseItemId: ITEM_ID_2, vin: 'SAME-VIN' }, // Duplicate
          ],
        },
        USER_ID,
        BRANCH_ID,
        false,
      )
    ).rejects.toThrow(ConflictException);
  });

  it('should throw VIN_REQUIRED when no VIN provided and none on item', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce(makeLockedPurchase('ordered'))
      .mockResolvedValueOnce(makeLockedItems()); // Items have vin: null

    await expect(
      service.receive(
        PURCHASE_ID,
        { items: [{ purchaseItemId: ITEM_ID_1, vin: '' }] }, // Empty VIN
        USER_ID,
        BRANCH_ID,
        false,
      )
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BRANCH_SCOPE_VIOLATION for wrong-branch user', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce(makeLockedPurchase('ordered'))
      .mockResolvedValueOnce(makeLockedItems());

    await expect(
      service.receive(
        PURCHASE_ID,
        { items: [{ purchaseItemId: ITEM_ID_1, vin: 'VIN-001' }] },
        USER_ID,
        'DIFFERENT-BRANCH',  // User is from a different branch
        false,               // Not super admin
      )
    ).rejects.toThrow(ForbiddenException);
  });

  it('should allow super_admin to receive for any branch', async () => {
    setupHappyPath(makeLockedItems(), 'ordered', false);

    // Should NOT throw even though branchId doesn't match
    const result = await service.receive(
      PURCHASE_ID,
      { items: [{ purchaseItemId: ITEM_ID_1, vin: 'VIN-001' }] },
      USER_ID,
      'DIFFERENT-BRANCH',
      true, // isSuperAdmin = true
    );

    expect(result.receivedMotorcycles).toHaveLength(1);
  });

  it('should rollback if motorcycle creation fails (transaction wraps all)', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce(makeLockedPurchase('ordered'))
      .mockResolvedValueOnce(makeLockedItems());

    // First motorcycle succeeds, second fails
    prismaMock.motorcycle.create
      .mockResolvedValueOnce({ id: 'moto-1', vin: 'VIN-001', model: 'Test', status: 'in_transit' })
      .mockRejectedValueOnce(new Error('DB Error'));

    // The $transaction mock calls the callback — the error propagates up
    await expect(
      service.receive(
        PURCHASE_ID,
        {
          items: [
            { purchaseItemId: ITEM_ID_1, vin: 'VIN-001' },
            { purchaseItemId: ITEM_ID_2, vin: 'VIN-002' },
          ],
        },
        USER_ID,
        BRANCH_ID,
        false,
      )
    ).rejects.toThrow('DB Error');

    // In a real DB, the transaction would have rolled back motorcycle 1 creation.
    // Here we verify the error propagated (the real Prisma $transaction handles the rollback).
    expect(prismaMock.motorcycle.create).toHaveBeenCalledTimes(2);
    // purchase.update should NOT have been called because error was thrown
    expect(prismaMock.purchase.update).not.toHaveBeenCalled();
  });
});
