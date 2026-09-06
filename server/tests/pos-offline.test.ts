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
  prisma,
} from './helpers.js';

describe('POS Offline Tests', () => {
  let app: INestApplication;
  let cashierToken: string;
  let branchId: string;
  let cashierUser: any;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase();
    const data = await seedBaseData();
    branchId = data.branch.id;

    const role = await createRole('cashier', [
      { resource: 'order', action: 'read' },
      { resource: 'pos', action: 'create' },
      { resource: 'customer', action: 'create' },
      { resource: 'customer', action: 'read' },
    ]);

    cashierUser = await createStaffUser({
      name: 'Offline Cashier',
      email: 'cashier@test.com',
      password: 'pass123',
      roleId: role.id,
      branchId,
    });

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'cashier@test.com', password: 'pass123' });
    cashierToken = login.body.data.accessToken;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe('Sync Status', () => {
    it('should get offline sync status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pos/offline/sync-status')
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('isOnline');
      expect(res.body.data).toHaveProperty('queuedOperations');
      expect(res.body.data).toHaveProperty('conflicts');
      expect(Array.isArray(res.body.data.conflicts)).toBe(true);
    });
  });

  describe('Queue Operations', () => {
    it('should queue customer create operation', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/pos/offline/queue')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'customer_create',
          data: {
            name: 'Offline Customer',
            phone: '+966509999999',
            email: 'offline@test.com',
          },
          localTimestamp: new Date().toISOString(),
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('queueId');
      expect(res.body.data).toHaveProperty('position');
    });

    it('should queue customer update operation', async () => {
      // Create customer first
      const customer = await prisma.customer.create({
        data: {
          name: 'Update Test',
          phone: '+966508888888',
          isActive: true,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/pos/offline/queue')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'customer_update',
          data: {
            customerId: customer.id,
            name: 'Updated Name',
            timestamp: new Date().toISOString(),
          },
          localTimestamp: new Date().toISOString(),
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('should reject invalid offline operation types', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/pos/offline/queue')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'motorcycle_sale',
          data: { motorcycleId: 'test' },
          localTimestamp: new Date().toISOString(),
        })
        .expect(422);
    });

    it('drains a burst of queued operations instead of letting them pile up', async () => {
      // MAX_QUEUE_SIZE caps operations still waiting to sync. Queueing while the
      // server is reachable syncs each one inline, so a burst larger than the cap
      // is accepted rather than rejected — the backlog never builds.
      for (let i = 0; i < 12; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/pos/offline/queue')
          .set('Authorization', `Bearer ${cashierToken}`)
          .send({
            type: 'customer_create',
            data: {
              name: `Queue Test ${i}`,
              phone: `+96650700${i.toString().padStart(4, '0')}`,
            },
            localTimestamp: new Date().toISOString(),
          })
          .expect(201);
      }

      const queued = await request(app.getHttpServer())
        .get('/api/v1/pos/offline/queue')
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(200);

      expect(queued.body.data.every((op: any) => op.status !== 'pending')).toBe(true);
    });

    it('should reject operations exceeding size limit', async () => {
      const largeData = {
        name: 'Test',
        phone: '+966501234567',
        notes: 'A'.repeat(15000), // >10KB
      };

      await request(app.getHttpServer())
        .post('/api/v1/pos/offline/queue')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'customer_create',
          data: largeData,
          localTimestamp: new Date().toISOString(),
        })
        .expect(400);
    });
  });

  describe('Get Queued Operations', () => {
    it('should get user queued operations', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pos/offline/queue')
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
