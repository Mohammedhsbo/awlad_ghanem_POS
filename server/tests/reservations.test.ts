import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import {
  createTestApp,
  closeTestApp,
  resetDatabase,
  seedBaseData,
  createRole,
  createStaffUser,
  createCustomer,
  getAuthToken,
  prisma,
} from "./helpers.js";

describe("Reservations API - Integration Tests", () => {
  let app: INestApplication;
  let superAdminToken: string;
  let staffToken: string;
  let branchId: string;
  let brandId: string;
  let categoryId: string;
  let customerId: string;
  let motorcycleId: string;
  let staffUser: any;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase();
    const data = await seedBaseData();
    branchId = data.branch.id;

    // Login as superadmin
    const adminLoginRes = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: "admin@example.com",
        password: "admin123",
      });
    superAdminToken = adminLoginRes.body.data.accessToken;

    // Create staff role with reservation permissions
    const staffRole = await createRole("reservation_staff", [
      { resource: "reservation", action: "create" },
      { resource: "reservation", action: "read" },
      { resource: "reservation", action: "update" },
      { resource: "reservation", action: "delete" },
      { resource: "customer", action: "read" },
      { resource: "motorcycle", action: "read" },
    ]);

    // Create staff user
    staffUser = await createStaffUser({
      name: "Staff One",
      email: "staff@example.com",
      password: "staff123",
      roleId: staffRole.id,
      branchId: branchId,
    });
    staffToken = await getAuthToken(app, "staff@example.com", "staff123");

    // Create customer
    const customer = await createCustomer({
      name: "Test Customer",
      phone: "+966501234567",
      email: "customer@example.com",
      password: "customer123",
    });
    customerId = customer.id;

    // Create Brand
    const brand = await prisma.brand.create({
      data: {
        id: "10000000-0000-0000-0000-000000000001",
        nameAr: "ياماها",
        nameEn: "Yamaha",
      },
    });
    brandId = brand.id;

    // Create Category
    const category = await prisma.category.create({
      data: {
        id: "20000000-0000-0000-0000-000000000001",
        nameAr: "رياضية",
        nameEn: "Sport",
      },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await closeTestApp(app);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up reservations and motorcycles before each test
    await prisma.reservation.deleteMany();
    await prisma.motorcycle.deleteMany();

    // Create a test motorcycle
    const motorcycle = await prisma.motorcycle.create({
      data: {
        vin: "TEST-VIN-001",
        model: "YZF-R1",
        year: 2024,
        color: "Blue",
        price: 50000,
        costPrice: 40000,
        status: "available",
        brandId: brandId,
        categoryId: categoryId,
        branchId: branchId,
      },
    });
    motorcycleId = motorcycle.id;
  });

  describe("POST /api/v1/reservations - Create Reservation", () => {
    it("should create POS reservation successfully", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          customerId,
          motorcycleId,
          branchId,
          paidAmount: 5000,
          notes: "Test reservation",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        customer: { id: customerId },
        motorcycle: { id: motorcycleId, currentStatus: "reserved" },
        status: "active",
        totalPrice: 50000,
        paidAmount: 5000,
        remainingAmount: 45000,
      });
      expect(response.body.data.reservationNumber).toMatch(/^RES-MAI-\d{4}-\d+$/);
      expect(response.body.data.expiresAt).toBeDefined();

      // Verify motorcycle status changed
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycleId },
      });
      expect(motorcycle?.status).toBe("reserved");
    });

    it("should enforce minimum deposit (10% or 1000 EGP)", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          customerId,
          motorcycleId,
          branchId,
          paidAmount: 500, // Less than minimum
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_DEPOSIT_AMOUNT");
    });

    it("should reject deposit greater than totalPrice", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          customerId,
          motorcycleId,
          branchId,
          paidAmount: 60000, // More than price
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_DEPOSIT_AMOUNT");
    });

    it("should reject deposit <= 0", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          customerId,
          motorcycleId,
          branchId,
          paidAmount: 0,
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("should reject unavailable motorcycle", async () => {
      // Mark motorcycle as sold
      await prisma.motorcycle.update({
        where: { id: motorcycleId },
        data: { status: "sold" },
      });

      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          customerId,
          motorcycleId,
          branchId,
          paidAmount: 5000,
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("MOTORCYCLE_NOT_AVAILABLE");
    });

    it("should reject non-existent customer", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          customerId: "00000000-0000-0000-0000-000000000999",
          motorcycleId,
          branchId,
          paidAmount: 5000,
        });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("CUSTOMER_NOT_FOUND");
    });

    it("should reject inactive customer", async () => {
      await prisma.customer.update({
        where: { id: customerId },
        data: { isActive: false },
      });

      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          customerId,
          motorcycleId,
          branchId,
          paidAmount: 5000,
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CUSTOMER_INACTIVE");

      // Restore customer
      await prisma.customer.update({
        where: { id: customerId },
        data: { isActive: true },
      });
    });

    it("should snapshot motorcycle price", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          customerId,
          motorcycleId,
          branchId,
          paidAmount: 5000,
        });

      expect(response.status).toBe(201);
      const reservationId = response.body.data.id;

      // Change motorcycle price
      await prisma.motorcycle.update({
        where: { id: motorcycleId },
        data: { price: 60000 },
      });

      // Verify reservation still has old price
      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
      });
      expect(Number(reservation?.totalPrice)).toBe(50000);
    });

    it("should calculate remaining amount correctly", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          customerId,
          motorcycleId,
          branchId,
          paidAmount: 15000,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.totalPrice).toBe(50000);
      expect(response.body.data.paidAmount).toBe(15000);
      expect(response.body.data.remainingAmount).toBe(35000);
    });

    it("should generate unique reservation number", async () => {
      const response1 = await request(app.getHttpServer())
        .post("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          customerId,
          motorcycleId,
          branchId,
          paidAmount: 5000,
        });

      expect(response1.status).toBe(201);
      const resNum1 = response1.body.data.reservationNumber;

      // Create another motorcycle for second reservation
      const motorcycle2 = await prisma.motorcycle.create({
        data: {
          vin: "TEST-VIN-002",
          model: "YZF-R1",
          year: 2024,
          price: 50000,
          costPrice: 50000,
          status: "available",
          brandId: brandId,
          categoryId: categoryId,
          branchId: branchId,
        },
      });

      const response2 = await request(app.getHttpServer())
        .post("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          customerId,
          motorcycleId: motorcycle2.id,
          branchId,
          paidAmount: 5000,
        });

      expect(response2.status).toBe(201);
      const resNum2 = response2.body.data.reservationNumber;

      expect(resNum1).not.toBe(resNum2);
    });
  });

  describe("GET /api/v1/reservations - List Reservations", () => {
    beforeEach(async () => {
      // Create multiple reservations for testing
      for (let i = 0; i < 25; i++) {
        const moto = await prisma.motorcycle.create({
          data: {
            vin: `VIN-${i.toString().padStart(3, "0")}`,
            model: `Model-${i}`,
            year: 2024,
            price: 50000 + i * 1000,
            costPrice: 50000 + i * 1000,
            status: "available",
            brandId: brandId,
            categoryId: categoryId,
            branchId: branchId,
          },
        });

        await prisma.motorcycle.update({
          where: { id: moto.id },
          data: { status: "reserved" },
        });

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await prisma.reservation.create({
          data: {
            reservationNumber: `RES-MAI-2024-${(i + 1).toString().padStart(6, "0")}`,
            customerId,
            motorcycleId: moto.id,
            branchId,
            userId: staffUser.id,
            status: i < 20 ? "active" : "cancelled",
            totalPrice: 50000 + i * 1000,
            paidAmount: 5000,
            remainingAmount: 45000 + i * 1000,
            expiresAt,
          },
        });
      }
    });

    it("should list reservations with pagination", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(10);
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it("should search by reservation number", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ search: "RES-MAI-2024-000005" });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].reservationNumber).toBe("RES-MAI-2024-000005");
    });

    it("should search by customer name", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ search: "Test Customer" });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].customer.name).toContain("Test Customer");
    });

    it("should search by customer phone", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ search: "+966501234567" });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it("should search by motorcycle VIN", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ search: "VIN-010" });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
    });

    it("should filter by status", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ status: "active" });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(20);
      response.body.data.forEach((res: any) => {
        expect(res.status).toBe("active");
      });
    });

    it("should filter by branch", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ branchId });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      response.body.data.forEach((res: any) => {
        expect(res.branch.id).toBe(branchId);
      });
    });

    it("should sort by createdAt descending", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ sort: "createdAt", order: "desc", limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(5);

      const dates = response.body.data.map((r: any) => new Date(r.createdAt).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    });

    it("should sort by totalPrice ascending", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ sort: "totalPrice", order: "asc", limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(5);

      const prices = response.body.data.map((r: any) => r.totalPrice);
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
      }
    });

    it("should include daysUntilExpiry calculation", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ limit: 1 });

      expect(response.status).toBe(200);
      expect(response.body.data[0].daysUntilExpiry).toBeDefined();
      expect(typeof response.body.data[0].daysUntilExpiry).toBe("number");
    });

    it("should enforce branch scoping for staff", async () => {
      // Create another branch and staff
      const branch2 = await prisma.branch.create({
        data: {
          nameAr: "Branch 2",
          nameEn: "Branch 2",
          address: "Address 2",
          phone: "+966111111111",
        },
      });

      const staffRole2 = await createRole("staff_branch2", [
        { resource: "reservation", action: "read" },
      ]);

      const staff2 = await createStaffUser({
        name: "Staff Two",
        email: "staff2@example.com",
        roleId: staffRole2.id,
        branchId: branch2.id,
      });

      const staff2Token = await getAuthToken(app, "staff2@example.com", "password123");

      const response = await request(app.getHttpServer())
        .get("/api/v1/reservations")
        .set("Authorization", `Bearer ${staff2Token}`);

      expect(response.status).toBe(200);
      // Staff from branch2 should see 0 reservations (all are in branch1)
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe("GET /api/v1/reservations/:id - Get Single Reservation", () => {
    let reservationId: string;

    beforeEach(async () => {
      await prisma.motorcycle.update({
        where: { id: motorcycleId },
        data: { status: "reserved" },
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const reservation = await prisma.reservation.create({
        data: {
          reservationNumber: "RES-MAI-2024-000001",
          customerId,
          motorcycleId,
          branchId,
          userId: staffUser.id,
          status: "active",
          totalPrice: 50000,
          paidAmount: 5000,
          remainingAmount: 45000,
          expiresAt,
          notes: "Test note",
        },
      });
      reservationId = reservation.id;
    });

    it("should get reservation details", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/reservations/${reservationId}`)
        .set("Authorization", `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: reservationId,
        reservationNumber: "RES-MAI-2024-000001",
        status: "active",
        totalPrice: 50000,
        paidAmount: 5000,
        remainingAmount: 45000,
        notes: "Test note",
      });
      expect(response.body.data.customer).toBeDefined();
      expect(response.body.data.motorcycle).toBeDefined();
      expect(response.body.data.branch).toBeDefined();
      expect(response.body.data.statusHistory).toBeDefined();
    });

    it("should return 404 for non-existent reservation", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/reservations/00000000-0000-0000-0000-000000000999")
        .set("Authorization", `Bearer ${staffToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("RESERVATION_NOT_FOUND");
    });

    it("should enforce branch scope", async () => {
      const branch2 = await prisma.branch.create({
        data: {
          nameAr: "Branch 2",
          nameEn: "Branch 2",
          address: "Address 2",
          phone: "+966111111111",
        },
      });

      const staffRole2 = await createRole("staff_readonly_2", [
        { resource: "reservation", action: "read" },
      ]);

      const staff2 = await createStaffUser({
        name: "Staff Three",
        email: "staff3@example.com",
        roleId: staffRole2.id,
        branchId: branch2.id,
      });

      const staff2Token = await getAuthToken(app, "staff3@example.com", "password123");

      const response = await request(app.getHttpServer())
        .get(`/api/v1/reservations/${reservationId}`)
        .set("Authorization", `Bearer ${staff2Token}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("BRANCH_SCOPE_VIOLATION");
    });
  });

  describe("PATCH /api/v1/reservations/:id - Update Reservation", () => {
    let reservationId: string;

    beforeEach(async () => {
      await prisma.motorcycle.update({
        where: { id: motorcycleId },
        data: { status: "reserved" },
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const reservation = await prisma.reservation.create({
        data: {
          reservationNumber: "RES-MAI-2024-000001",
          customerId,
          motorcycleId,
          branchId,
          userId: staffUser.id,
          status: "active",
          totalPrice: 50000,
          paidAmount: 5000,
          remainingAmount: 45000,
          expiresAt,
        },
      });
      reservationId = reservation.id;
    });

    it("should update notes", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/reservations/${reservationId}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          notes: "Updated notes",
        });

      expect(response.status).toBe(200);
      expect(response.body.data.notes).toBe("Updated notes");
    });

    it("should update expiresAt", async () => {
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 14);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/reservations/${reservationId}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          expiresAt: newExpiresAt.toISOString(),
        });

      expect(response.status).toBe(200);
      expect(new Date(response.body.data.expiresAt).getTime()).toBeCloseTo(
        newExpiresAt.getTime(),
        -3
      );
    });

    it("should reject past expiration date", async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/reservations/${reservationId}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          expiresAt: pastDate.toISOString(),
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_EXPIRATION_DATE");
    });

    it("should reject update of non-active reservation", async () => {
      await prisma.reservation.update({
        where: { id: reservationId },
        data: { status: "cancelled" },
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/reservations/${reservationId}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          notes: "Cannot update",
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("RESERVATION_NOT_ACTIVE");
    });
  });

  describe("POST /api/v1/reservations/:id/extend - Extend Reservation", () => {
    let reservationId: string;

    beforeEach(async () => {
      await prisma.motorcycle.update({
        where: { id: motorcycleId },
        data: { status: "reserved" },
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const reservation = await prisma.reservation.create({
        data: {
          reservationNumber: "RES-MAI-2024-000001",
          customerId,
          motorcycleId,
          branchId,
          userId: staffUser.id,
          status: "active",
          totalPrice: 50000,
          paidAmount: 5000,
          remainingAmount: 45000,
          expiresAt,
        },
      });
      reservationId = reservation.id;
    });

    it("should extend reservation expiration", async () => {
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 30);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/reservations/${reservationId}/extend`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          expiresAt: newExpiresAt.toISOString(),
          reason: "Customer requested extension",
        });

      expect(response.status).toBe(201);
      expect(response.body.data.expiresAt).toBeDefined();
      expect(response.body.data.daysUntilExpiry).toBeGreaterThan(25);
    });

    it("should reject extension beyond maximum days", async () => {
      const tooFarDate = new Date();
      tooFarDate.setDate(tooFarDate.getDate() + 100);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/reservations/${reservationId}/extend`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          expiresAt: tooFarDate.toISOString(),
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_EXPIRATION_DATE");
    });

    it("should reject extension of non-active reservation", async () => {
      await prisma.reservation.update({
        where: { id: reservationId },
        data: { status: "expired" },
      });

      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 14);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/reservations/${reservationId}/extend`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          expiresAt: newExpiresAt.toISOString(),
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("RESERVATION_NOT_ACTIVE");
    });
  });

  describe("POST /api/v1/reservations/:id/cancel - Cancel Reservation", () => {
    let reservationId: string;

    beforeEach(async () => {
      await prisma.motorcycle.update({
        where: { id: motorcycleId },
        data: { status: "reserved" },
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const reservation = await prisma.reservation.create({
        data: {
          reservationNumber: "RES-MAI-2024-000001",
          customerId,
          motorcycleId,
          branchId,
          userId: staffUser.id,
          status: "active",
          totalPrice: 50000,
          paidAmount: 5000,
          remainingAmount: 45000,
          expiresAt,
        },
      });
      reservationId = reservation.id;
    });

    it("should cancel reservation and release motorcycle", async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/reservations/${reservationId}/cancel`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          reason: "Customer changed mind",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);

      // Verify reservation status
      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
      });
      expect(reservation?.status).toBe("cancelled");

      // Verify motorcycle released
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycleId },
      });
      expect(motorcycle?.status).toBe("available");
    });

    it("should reject cancellation of non-active reservation", async () => {
      await prisma.reservation.update({
        where: { id: reservationId },
        data: { status: "converted" },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/reservations/${reservationId}/cancel`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          reason: "Test",
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("RESERVATION_NOT_ACTIVE");
    });
  });

  describe("GET /api/v1/customers/:customerId/reservations - Customer Reservations", () => {
    beforeEach(async () => {
      // Create multiple reservations for the customer
      for (let i = 0; i < 5; i++) {
        const moto = await prisma.motorcycle.create({
          data: {
            vin: `CUST-VIN-${i}`,
            model: `Model-${i}`,
            year: 2024,
            price: 50000,
            costPrice: 50000,
            status: "reserved",
            brandId: brandId,
            categoryId: categoryId,
            branchId: branchId,
          },
        });

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await prisma.reservation.create({
          data: {
            reservationNumber: `RES-CUST-${i}`,
            customerId,
            motorcycleId: moto.id,
            branchId,
            userId: staffUser.id,
            status: "active",
            totalPrice: 50000,
            paidAmount: 5000,
            remainingAmount: 45000,
            expiresAt,
          },
        });
      }
    });

    it("should get customer reservations", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customerId}/reservations`)
        .set("Authorization", `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(5);
      response.body.data.forEach((res: any) => {
        expect(res.customer.id).toBe(customerId);
      });
    });

    it("should support pagination", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customerId}/reservations`)
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ page: 1, limit: 2 });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBe(5);
    });
  });
});
