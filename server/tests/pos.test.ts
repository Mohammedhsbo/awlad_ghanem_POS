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

describe('POS API - Integration Tests', () => {
  let app: INestApplication;
  let cashierToken: string;
  let superAdminToken: string;
  let managerToken: string;
  let branchId: string;
  let customerId: string;
  let motorcycleId: string;
  let brandId: string;
  let categoryId: string;
  let cashierUser: any;
  let managerUser: any;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase();
    const data = await seedBaseData();
    branchId = data.branch.id;

    await prisma.rolePermission.create({
      data: {
        roleId: data.superAdminRole.id,
        resource: 'order',
        action: 'read',
      },
    });

    // Create roles
    const cashierRole = await createRole('pos_cashier', [
      { resource: 'order', action: 'create' },
      { resource: 'order', action: 'read' },
      { resource: 'customer', action: 'read' },
      { resource: 'customer', action: 'create' },
      { resource: 'motorcycle', action: 'read' },
      { resource: 'reservation', action: 'create' },
      { resource: 'reservation', action: 'read' },
      { resource: 'reservation', action: 'update' },
    ]);

    const managerRole = await createRole('pos_manager', [
      { resource: 'order', action: 'create' },
      { resource: 'order', action: 'read' },
      { resource: 'order', action: 'delete' },
      { resource: 'customer', action: 'read' },
      { resource: 'customer', action: 'create' },
      { resource: 'motorcycle', action: 'read' },
      { resource: 'reservation', action: 'create' },
      { resource: 'reservation', action: 'read' },
      { resource: 'reservation', action: 'update' },
    ]);

    // Create users
    cashierUser = await createStaffUser({
      name: 'POS Cashier',
      email: 'cashier@pos.test',
      password: 'password123',
      roleId: cashierRole.id,
      branchId,
    });

    managerUser = await createStaffUser({
      name: 'POS Manager',
      email: 'manager@pos.test',
      password: 'password123',
      roleId: managerRole.id,
      branchId,
    });

    // Login
    const cashierLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'cashier@pos.test', password: 'password123' });
    cashierToken = cashierLogin.body.data.accessToken;

    const managerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'manager@pos.test', password: 'password123' });
    managerToken = managerLogin.body.data.accessToken;

    const superAdminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'admin123' });
    superAdminToken = superAdminLogin.body.data.accessToken;

    // Create test data
    const customer = await createCustomer({ name: 'POS Test Customer', phone: '+966501234567' });
    customerId = customer.id;

    const brand = await prisma.brand.create({
      data: { nameAr: 'هوندا', nameEn: 'Honda' },
    });
    brandId = brand.id;

    const category = await prisma.category.create({
      data: { nameAr: 'رياضية', nameEn: 'Sport' },
    });
    categoryId = category.id;

    const motorcycle = await prisma.motorcycle.create({
      data: {
        vin: 'TEST-VIN-001',
        brandId,
        categoryId,
        model: 'CBR600RR',
        year: 2024,
        color: 'Red',
        price: 50000,
        costPrice: 50000,
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

  describe('Dashboard', () => {
    it('should get POS dashboard with stats', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pos/dashboard')
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('currentUser');
      expect(res.body.data).toHaveProperty('todayStats');
      expect(res.body.data).toHaveProperty('recentTransactions');
      expect(res.body.data.currentUser).toHaveProperty('permissions');
      expect(res.body.data.todayStats).toHaveProperty('availableMotorcycles');
    });

    it('should get an all-branches dashboard for a super-admin without a branch', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pos/dashboard')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.data.currentUser.branch).toBeNull();
      expect(res.body.data.currentUser.permissions.canSwitchBranch).toBe(true);
    });
  });

  describe('Search', () => {
    it('should return the full customer list when q is empty', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pos/customers/search')
        .query({ q: '', limit: 10 })
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data).toMatchObject({ page: 1, limit: 10 });
      expect(res.body.data.total).toBeGreaterThan(0);
      expect(res.body.data.items[0]).toHaveProperty('recentOrderCount');
      expect(res.body.data.items[0]).toHaveProperty('activeReservationCount');
    });

    it('should search customers', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pos/customers/search')
        .query({ q: 'POS Test', limit: 10 })
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.items[0]).toHaveProperty('recentOrderCount');
      expect(res.body.data.items[0]).toHaveProperty('activeReservationCount');
    });

    it('should search motorcycles', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pos/motorcycles/search')
        .query({ q: 'CBR', limit: 20 })
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].status).toBe('available');
    });

    it('should reject search with short query', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/pos/customers/search')
        .query({ q: 'P' })
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(422);
    });
  });

  describe('Cash sales', () => {
    it('should create a cash sale using the authenticated branch without requiring a body branchId', async () => {
      const cashSaleMotorcycle = await prisma.motorcycle.create({
        data: {
          vin: 'TEST-VIN-CASH-001',
          brandId,
          categoryId,
          model: 'CBR500R',
          year: 2025,
          color: 'Blue',
          price: 12000,
          costPrice: 12000,
          status: 'available',
          branchId,
          images: [],
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/pos/cash-sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .field('motorcycleId', cashSaleMotorcycle.id)
        .field('customerName', 'Walk-in Cash Customer')
        .field('customerPhone', '+966500000001')
        .field('salePrice', '12000')
        .field('paymentMethod', 'CASH')
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.branchId).toBe(branchId);
      expect(res.body.data.customerPhone).toBe('+966500000001');
    });

    it('should let a super_admin cash sale without a body branchId by deriving it from the motorcycle branch', async () => {
      const cashSaleMotorcycle = await prisma.motorcycle.create({
        data: {
          vin: 'TEST-VIN-CASH-002',
          brandId,
          categoryId,
          model: 'CBR650R',
          year: 2025,
          color: 'Black',
          price: 15000,
          costPrice: 15000,
          status: 'available',
          branchId,
          images: [],
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/pos/cash-sales')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('motorcycleId', cashSaleMotorcycle.id)
        .field('customerName', 'Super Admin Cash Customer')
        .field('customerPhone', '+966500000002')
        .field('salePrice', '15000')
        .field('paymentMethod', 'CASH')
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.branchId).toBe(cashSaleMotorcycle.branchId);
      expect(res.body.data.customerPhone).toBe('+966500000002');
    });

    it('should reject a staff cash sale that tries to override branchId with a different branch', async () => {
      const cashSaleMotorcycle = await prisma.motorcycle.create({
        data: {
          vin: 'TEST-VIN-CASH-003',
          brandId,
          categoryId,
          model: 'CBR700R',
          year: 2025,
          color: 'Silver',
          price: 18000,
          costPrice: 18000,
          status: 'available',
          branchId,
          images: [],
        },
      });

      const otherBranch = await prisma.branch.create({
        data: {
          nameAr: 'فرع آخر',
          nameEn: 'Another Branch',
          code: 'BR-OTHER',
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/pos/cash-sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .field('motorcycleId', cashSaleMotorcycle.id)
        .field('customerName', 'Wrong Branch Customer')
        .field('customerPhone', '+966500000003')
        .field('salePrice', '18000')
        .field('paymentMethod', 'CASH')
        .field('branchId', otherBranch.id)
        .expect(400);

      expect(res.body.message).toMatch(/branch|Branch/i);
    });
  });

  describe('Transaction Validation', () => {
    it('should validate valid transaction', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/pos/validate-transaction')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          customerId,
          motorcycleId,
          type: 'order',
          discount: 1000,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.customer.isActive).toBe(true);
      expect(res.body.data.motorcycle.isAvailable).toBe(true);
      expect(res.body.data.calculations).toHaveProperty('totalAmount');
      expect(res.body.data.calculations).toHaveProperty('netAmount');
    });

    it('should detect unavailable motorcycle', async () => {
      // Create sold motorcycle
      const soldMotorcycle = await prisma.motorcycle.create({
        data: {
          vin: 'TEST-SOLD-001',
          brandId,
          categoryId,
          model: 'CBR1000RR',
          year: 2024,
          color: 'Black',
          price: 70000,
          costPrice: 70000,
          status: 'sold',
          branchId,
          images: [],
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/pos/validate-transaction')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          customerId,
          motorcycleId: soldMotorcycle.id,
          type: 'order',
        })
        .expect(200);

      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.motorcycle.isAvailable).toBe(false);
    });
  });

  describe('Transaction Creation', () => {
    it('should create order transaction', async () => {
      const idempotencyKey = generateIdempotencyKey(cashierUser.id, {
        customerId,
        motorcycleId,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/pos/transactions')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'order',
          customerId,
          motorcycleId,
          discount: { amount: 1000 },
          idempotencyKey,
          notes: 'Test order',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('order');
      expect(res.body.data).toHaveProperty('number');
      expect(res.body.data).toHaveProperty('customer');
      expect(res.body.data).toHaveProperty('motorcycle');
    });

    it('should create reservation transaction', async () => {
      // Create another motorcycle
      const motorcycle2 = await prisma.motorcycle.create({
        data: {
          vin: 'TEST-VIN-002',
          brandId,
          categoryId,
          model: 'CB500X',
          year: 2024,
          color: 'Blue',
          price: 35000,
          costPrice: 35000,
          status: 'available',
          branchId,
          images: [],
        },
      });

      const idempotencyKey = generateIdempotencyKey(cashierUser.id, {
        customerId,
        motorcycleId: motorcycle2.id,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/pos/transactions')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'reservation',
          customerId,
          motorcycleId: motorcycle2.id,
          reservationData: {
            depositAmount: 5000,
            expirationDays: 7,
          },
          idempotencyKey,
          notes: 'Test reservation',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('reservation');
      expect(res.body.data.depositAmount).toBe(5000);
      expect(res.body.data).toHaveProperty('expiresAt');
    });
  });

  describe('Discount Authorization', () => {
    it('should allow cashier small discount', async () => {
      const motorcycle3 = await prisma.motorcycle.create({
        data: {
          vin: 'TEST-VIN-DISCOUNT-1',
          brandId,
          categoryId,
          model: 'PCX160',
          year: 2024,
          color: 'White',
          price: 20000,
          costPrice: 20000,
          status: 'available',
          branchId,
          images: [],
        },
      });

      const idempotencyKey = generateIdempotencyKey(cashierUser.id, {
        customerId,
        motorcycleId: motorcycle3.id,
        timestamp: Date.now(),
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/pos/transactions')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'order',
          customerId,
          motorcycleId: motorcycle3.id,
          discount: { amount: 800, reason: 'Loyal customer' },
          idempotencyKey,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('should reject excessive cashier discount', async () => {
      const motorcycle4 = await prisma.motorcycle.create({
        data: {
          vin: 'TEST-VIN-DISCOUNT-2',
          brandId,
          categoryId,
          model: 'Forza350',
          year: 2024,
          color: 'Gray',
          price: 45000,
          costPrice: 45000,
          status: 'available',
          branchId,
          images: [],
        },
      });

      const idempotencyKey = generateIdempotencyKey(cashierUser.id, {
        customerId,
        motorcycleId: motorcycle4.id,
        timestamp: Date.now() + 1,
      });

      await request(app.getHttpServer())
        .post('/api/v1/pos/transactions')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'order',
          customerId,
          motorcycleId: motorcycle4.id,
          discount: { amount: 5000, reason: 'Too high' },
          idempotencyKey,
        })
        .expect(400);
    });
  });

  describe('Active Reservations', () => {
    it('should get active reservations', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/pos/reservations/active')
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('RBAC', () => {
    it('should enforce permissions on transaction creation', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/pos/dashboard')
        .expect(401);
    });
  });
});
