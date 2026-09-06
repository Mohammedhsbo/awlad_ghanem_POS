import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  resetDatabase,
  seedBaseData,
  createRole,
  createStaffUser,
  createCustomer,
  prisma,
} from './helpers.js';
import { generateIdempotencyKey } from '@motorcycle-system/shared-types';

describe('POS Concurrency Tests', () => {
  let app: INestApplication;
  let cashierToken1: string;
  let cashierToken2: string;
  let branchId: string;
  let customerId1: string;
  let customerId2: string;
  let motorcycleId: string;
  let cashier1: any;
  let cashier2: any;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase();
    const data = await seedBaseData();
    branchId = data.branch.id;

    const role = await createRole('cashier', [
      { resource: 'order', action: 'create' },
      { resource: 'order', action: 'read' },
      { resource: 'customer', action: 'read' },
      { resource: 'motorcycle', action: 'read' },
    ]);

    cashier1 = await createStaffUser({
      name: 'Cashier One',
      email: 'cashier1@test.com',
      password: 'pass123',
      roleId: role.id,
      branchId,
    });
    cashier2 = await createStaffUser({
      name: 'Cashier Two',
      email: 'cashier2@test.com',
      password: 'pass123',
      roleId: role.id,
      branchId,
    });

    const login1 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'cashier1@test.com', password: 'pass123' });
    cashierToken1 = login1.body.data.accessToken;

    const login2 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'cashier2@test.com', password: 'pass123' });
    cashierToken2 = login2.body.data.accessToken;

    const customer1 = await createCustomer({ name: 'Customer 1', phone: '+966501111111' });
    const customer2 = await createCustomer({ name: 'Customer 2', phone: '+966502222222' });
    customerId1 = customer1.id;
    customerId2 = customer2.id;

    const brand = await prisma.brand.create({
      data: { nameAr: 'ياماها', nameEn: 'Yamaha' },
    });

    const category = await prisma.category.create({
      data: { nameAr: 'سبورت', nameEn: 'Sport' },
    });

    const motorcycle = await prisma.motorcycle.create({
      data: {
        vin: 'CONCURRENT-VIN-001',
        brandId: brand.id,
        categoryId: category.id,
        model: 'YZF-R3',
        year: 2024,
        color: 'Blue',
        price: 40000,
        costPrice: 40000,
        status: 'available',
        branchId,
        images: [],
      },
    });
    motorcycleId = motorcycle.id;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe('Concurrent Sale Attempts', () => {
    it('should handle concurrent sale attempts for same motorcycle', async () => {
      const key1 = generateIdempotencyKey(cashier1.id, {
        customerId: customerId1,
        motorcycleId,
        timestamp: Date.now(),
      });

      const key2 = generateIdempotencyKey(cashier2.id, {
        customerId: customerId2,
        motorcycleId,
        timestamp: Date.now() + 1,
      });

      // Both cashiers try to sell same motorcycle simultaneously
      const [result1, result2] = await Promise.allSettled([
        request(app.getHttpServer())
          .post('/api/v1/pos/transactions')
          .set('Authorization', `Bearer ${cashierToken1}`)
          .send({
            type: 'order',
            customerId: customerId1,
            motorcycleId,
            idempotencyKey: key1,
          }),
        request(app.getHttpServer())
          .post('/api/v1/pos/transactions')
          .set('Authorization', `Bearer ${cashierToken2}`)
          .send({
            type: 'order',
            customerId: customerId2,
            motorcycleId,
            idempotencyKey: key2,
          }),
      ]);

      // One should succeed, one should fail
      const statuses = [
        result1.status === 'fulfilled' ? result1.value.status : 0,
        result2.status === 'fulfilled' ? result2.value.status : 0,
      ];

      const successCount = statuses.filter((s) => s === 201).length;
      const failCount = statuses.filter((s) => s === 400 || s === 409).length;

      expect(successCount).toBe(1);
      expect(failCount).toBe(1);

      // Verify motorcycle is no longer available
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycleId },
      });
      expect(motorcycle?.status).not.toBe('available');
    });
  });

  describe('Idempotency', () => {
    it('should handle duplicate idempotency key', async () => {
      const motorcycle2 = await prisma.motorcycle.create({
        data: {
          vin: 'IDEMPOTENCY-VIN-001',
          brandId: (await prisma.brand.findFirst())!.id,
          categoryId: (await prisma.category.findFirst())!.id,
          model: 'MT-07',
          year: 2024,
          color: 'Black',
          price: 45000,
          costPrice: 45000,
          status: 'available',
          branchId,
          images: [],
        },
      });

      const key = generateIdempotencyKey(cashier1.id, {
        customerId: customerId1,
        motorcycleId: motorcycle2.id,
      });

      // First request
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/pos/transactions')
        .set('Authorization', `Bearer ${cashierToken1}`)
        .send({
          type: 'order',
          customerId: customerId1,
          motorcycleId: motorcycle2.id,
          idempotencyKey: key,
        })
        .expect(201);

      // Duplicate request with same key
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/pos/transactions')
        .set('Authorization', `Bearer ${cashierToken1}`)
        .send({
          type: 'order',
          customerId: customerId1,
          motorcycleId: motorcycle2.id,
          idempotencyKey: key,
        })
        .expect(201);

      // Should return same result
      expect(res1.body.data.id).toBe(res2.body.data.id);
    });
  });
});
