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

describe("Orders API - Integration Tests", () => {
  let app: INestApplication;
  let superAdminToken: string;
  let cashierToken: string;
  let customerToken: string;
  let branchId: string;
  let brandId: string;
  let categoryId: string;
  let customerId: string;
  let customerUser: any;
  let cashierUser: any;

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

    // Create cashier role with order permissions
    const cashierRole = await createRole("cashier", [
      { resource: "order", action: "create" },
      { resource: "order", action: "read" },
      { resource: "order", action: "update" },
      { resource: "order", action: "delete" },
      { resource: "customer", action: "read" },
    ]);

    // Create cashier user
    cashierUser = await createStaffUser({
      name: "Cashier One",
      email: "cashier@example.com",
      password: "cashier123",
      roleId: cashierRole.id,
      branchId: branchId,
    });
    cashierToken = await getAuthToken(app, "cashier@example.com", "cashier123");

    // Create customer
    customerUser = await createCustomer({
      name: "Test Customer",
      phone: "+966501234567",
      email: "customer@example.com",
      password: "customer123",
    });
    customerId = customerUser.id;

    // Create customer role with order permissions
    const customerRolePerms = await prisma.role.update({
      where: { name: "customer" },
      data: {
        permissions: {
          create: [
            { resource: "order", action: "create" },
            { resource: "order", action: "read" },
          ],
        },
      },
    });

    // Get customer auth token (would need customer login endpoint)
    // For now, skip customer token tests

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
  });

  describe("Order Creation", () => {
    let motorcycle1Id: string;
    let motorcycle2Id: string;

    beforeEach(async () => {
      // Clean up orders and motorcycles before each test
      await prisma.orderItem.deleteMany();
      await prisma.order.deleteMany();
      await prisma.motorcycle.deleteMany();

      // Create available motorcycles
      const moto1 = await prisma.motorcycle.create({
        data: {
          vin: "TEST-VIN-001",
          model: "YZF-R1",
          year: 2024,
          price: 50000,
          costPrice: 40000,
          brandId,
          categoryId,
          branchId,
          status: "available",
        },
      });
      motorcycle1Id = moto1.id;

      const moto2 = await prisma.motorcycle.create({
        data: {
          vin: "TEST-VIN-002",
          model: "YZF-R6",
          year: 2024,
          price: 40000,
          costPrice: 32000,
          brandId,
          categoryId,
          branchId,
          status: "available",
        },
      });
      motorcycle2Id = moto2.id;
    });

    it("should create a POS order (confirmed)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [motorcycle1Id],
          discount: 0,
          notes: "POS sale",
          isDraft: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("confirmed");
      expect(res.body.data.orderNumber).toMatch(/^ORD-MAI-\d{4}-\d{5}$/);
      expect(res.body.data.totalAmount).toBe(50000);
      expect(res.body.data.netAmount).toBe(50000);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].unitPrice).toBe(50000);

      // Verify motorcycle is sold
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycle1Id },
      });
      expect(motorcycle?.status).toBe("sold");
    });

    it("should create a draft order (not allocated)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [motorcycle1Id],
          discount: 0,
          notes: "Draft order",
          isDraft: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("draft");

      // Verify motorcycle is still available
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycle1Id },
      });
      expect(motorcycle?.status).toBe("available");
    });

    it("should create order with multiple motorcycles", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [motorcycle1Id, motorcycle2Id],
          discount: 5000,
          isDraft: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.totalAmount).toBe(90000);
      expect(res.body.data.discount).toBe(5000);
      expect(res.body.data.netAmount).toBe(85000);

      // Both motorcycles should be sold
      const motos = await prisma.motorcycle.findMany({
        where: { id: { in: [motorcycle1Id, motorcycle2Id] } },
      });
      expect(motos.every((m) => m.status === "sold")).toBe(true);
    });

    it("should reject order with unavailable motorcycle", async () => {
      // Mark motorcycle as sold
      await prisma.motorcycle.update({
        where: { id: motorcycle1Id },
        data: { status: "sold" },
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [motorcycle1Id],
          isDraft: false,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("MOTORCYCLE_NOT_AVAILABLE");
    });

    it("should reject order with motorcycle from wrong branch", async () => {
      // Create another branch
      const otherBranch = await prisma.branch.create({
        data: {
          nameAr: "فرع آخر",
          nameEn: "Other Branch",
          address: "Other location",
          phone: "+966509999999",
        },
      });

      // The motorcycle lives in the other branch; the order is placed in the
      // cashier's own branch, so branch scoping passes and the per-motorcycle
      // check is what has to reject it.
      const otherBranchMotorcycle = await prisma.motorcycle.create({
        data: {
          vin: "VN-OTHER-BRANCH-001",
          model: "Other Branch Bike",
          year: 2024,
          price: 40000,
          costPrice: 32000,
          status: "available",
          brandId,
          categoryId,
          branchId: otherBranch.id,
        },
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [otherBranchMotorcycle.id],
          isDraft: false,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("MOTORCYCLE_WRONG_BRANCH");
    });

    it("should reject order with discount exceeding total", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [motorcycle1Id],
          discount: 60000, // More than motorcycle price
          isDraft: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_DISCOUNT");
    });

    it("should snapshot motorcycle price at order time", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [motorcycle1Id],
          isDraft: false,
        });

      const orderId = res.body.data.id;
      const originalPrice = res.body.data.items[0].unitPrice;
      expect(originalPrice).toBe(50000);

      // Change motorcycle price
      await prisma.motorcycle.update({
        where: { id: motorcycle1Id },
        data: { price: 55000 },
      });

      // Get order detail - should still show original price
      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(detailRes.body.data.items[0].unitPrice).toBe(50000);
      expect(detailRes.body.data.totalAmount).toBe(50000);
    });
  });

  describe("Draft Order Confirmation", () => {
    let draftOrderId: string;
    let motorcycleId: string;

    beforeEach(async () => {
      await prisma.orderItem.deleteMany();
      await prisma.order.deleteMany();
      await prisma.motorcycle.deleteMany();

      const moto = await prisma.motorcycle.create({
        data: {
          vin: "TEST-DRAFT-001",
          model: "MT-09",
          year: 2024,
          price: 45000,
          costPrice: 36000,
          brandId,
          categoryId,
          branchId,
          status: "available",
        },
      });
      motorcycleId = moto.id;

      // Create draft order
      const draftRes = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [motorcycleId],
          isDraft: true,
        });

      draftOrderId = draftRes.body.data.id;
    });

    it("should confirm draft order and allocate motorcycle", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${draftOrderId}/confirm`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send();

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("confirmed");

      // Verify motorcycle is now sold
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycleId },
      });
      expect(motorcycle?.status).toBe("sold");
    });

    it("should reject confirmation if motorcycle became unavailable", async () => {
      // Mark motorcycle as sold by another order
      await prisma.motorcycle.update({
        where: { id: motorcycleId },
        data: { status: "sold" },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${draftOrderId}/confirm`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send();

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("MOTORCYCLE_NOT_AVAILABLE");
    });

    it("should reject confirmation of non-draft order", async () => {
      // First confirm the order
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${draftOrderId}/confirm`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send();

      // Try to confirm again
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${draftOrderId}/confirm`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send();

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ORDER_NOT_DRAFT");
    });
  });

  describe("Order Retrieval", () => {
    let order1Id: string;
    let order2Id: string;

    beforeEach(async () => {
      await prisma.orderItem.deleteMany();
      await prisma.order.deleteMany();
      await prisma.motorcycle.deleteMany();

      const moto1 = await prisma.motorcycle.create({
        data: {
          vin: "RETRIEVE-001",
          model: "R1",
          year: 2024,
          price: 50000,
          costPrice: 40000,
          brandId,
          categoryId,
          branchId,
          status: "available",
        },
      });

      const moto2 = await prisma.motorcycle.create({
        data: {
          vin: "RETRIEVE-002",
          model: "R6",
          year: 2024,
          price: 40000,
          costPrice: 32000,
          brandId,
          categoryId,
          branchId,
          status: "available",
        },
      });

      // Create two orders
      const res1 = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [moto1.id],
          isDraft: false,
        });
      order1Id = res1.body.data.id;

      const res2 = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [moto2.id],
          isDraft: true,
        });
      order2Id = res2.body.data.id;
    });

    it("should get order by ID", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${order1Id}`)
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(order1Id);
      expect(res.body.data.customer.name).toBe("Test Customer");
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.statusHistory).toBeDefined();
    });

    it("should list all orders with pagination", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/orders?page=1&limit=10")
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
      expect(res.body.meta.page).toBe(1);
    });

    it("should filter orders by status", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/orders?status=draft")
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe("draft");
    });

    it("should search orders by order number", async () => {
      const order = await prisma.order.findUnique({ where: { id: order1Id } });
      const orderNumber = order!.orderNumber;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders?search=${orderNumber}`)
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].orderNumber).toBe(orderNumber);
    });

    it("should search orders by customer name", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/orders?search=Test Customer")
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it("should get customer order history", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customerId}/orders`)
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe("Order Status Transitions", () => {
    let orderId: string;
    let motorcycleId: string;

    beforeEach(async () => {
      await prisma.orderItem.deleteMany();
      await prisma.order.deleteMany();
      await prisma.motorcycle.deleteMany();

      const moto = await prisma.motorcycle.create({
        data: {
          vin: "STATUS-001",
          model: "MT-10",
          year: 2024,
          price: 60000,
          costPrice: 48000,
          brandId,
          categoryId,
          branchId,
          status: "available",
        },
      });
      motorcycleId = moto.id;

      const res = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [motorcycleId],
          isDraft: false,
        });

      orderId = res.body.data.id;
    });

    it("should transition from confirmed to processing", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          status: "processing",
          reason: "Payment received",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("processing");
      expect(res.body.data.previousStatus).toBe("confirmed");
    });

    it("should transition from processing to completed", async () => {
      // First move to processing
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({ status: "processing" });

      // Then to completed
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({ status: "completed" });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("completed");
    });

    it("should reject invalid status transition", async () => {
      // Try to go directly from confirmed to completed (must go through processing)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({ status: "completed" });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVALID_STATUS_TRANSITION");
    });

    it("should revert motorcycle to available on refund", async () => {
      // Move to processing, then refunded
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({ status: "processing" });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({ status: "refunded" });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("refunded");

      // Verify motorcycle is available
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycleId },
      });
      expect(motorcycle?.status).toBe("available");
    });
  });

  describe("Order Update", () => {
    let draftOrderId: string;
    let confirmedOrderId: string;
    let motorcycleId: string;
    let newMotorcycleId: string;

    beforeEach(async () => {
      await prisma.orderItem.deleteMany();
      await prisma.order.deleteMany();
      await prisma.motorcycle.deleteMany();

      const moto1 = await prisma.motorcycle.create({
        data: {
          vin: "UPDATE-001",
          model: "XSR900",
          year: 2024,
          price: 45000,
          costPrice: 36000,
          brandId,
          categoryId,
          branchId,
          status: "available",
        },
      });
      motorcycleId = moto1.id;

      const moto2 = await prisma.motorcycle.create({
        data: {
          vin: "UPDATE-002",
          model: "MT-07",
          year: 2024,
          price: 35000,
          costPrice: 28000,
          brandId,
          categoryId,
          branchId,
          status: "available",
        },
      });
      newMotorcycleId = moto2.id;

      // Create draft order
      const draftRes = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [motorcycleId],
          isDraft: true,
        });
      draftOrderId = draftRes.body.data.id;

      // Create confirmed order
      const confirmedRes = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [motorcycleId],
          isDraft: false,
        });
      confirmedOrderId = confirmedRes.body.data.id;
    });

    it("should update draft order items", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${draftOrderId}`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          motorcycleIds: [newMotorcycleId],
          discount: 2000,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].motorcycle.vin).toBe("UPDATE-002");
      expect(res.body.data.discount).toBe(2000);
    });

    it("should update notes on any order", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${confirmedOrderId}`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          notes: "Updated notes",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.notes).toBe("Updated notes");
    });

    it("should reject item changes on confirmed order", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${confirmedOrderId}`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          motorcycleIds: [newMotorcycleId],
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ORDER_NOT_DRAFT");
    });
  });

  describe("Order Cancellation", () => {
    let confirmedOrderId: string;
    let completedOrderId: string;
    let motorcycleId: string;

    beforeEach(async () => {
      await prisma.orderItem.deleteMany();
      await prisma.order.deleteMany();
      await prisma.motorcycle.deleteMany();

      const moto = await prisma.motorcycle.create({
        data: {
          vin: "CANCEL-001",
          model: "R3",
          year: 2024,
          price: 25000,
          costPrice: 20000,
          brandId,
          categoryId,
          branchId,
          status: "available",
        },
      });
      motorcycleId = moto.id;

      // Create confirmed order
      const confirmedRes = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [motorcycleId],
          isDraft: false,
        });
      confirmedOrderId = confirmedRes.body.data.id;

      // Create another motorcycle for completed order
      const moto2 = await prisma.motorcycle.create({
        data: {
          vin: "CANCEL-002",
          model: "R7",
          year: 2024,
          price: 40000,
          costPrice: 32000,
          brandId,
          categoryId,
          branchId,
          status: "available",
        },
      });

      // Create and complete an order
      const completedRes = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [moto2.id],
          isDraft: false,
        });
      completedOrderId = completedRes.body.data.id;

      // Move to completed
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${completedOrderId}/status`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({ status: "processing" });

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${completedOrderId}/status`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({ status: "completed" });
    });

    it("should cancel confirmed order and free motorcycle", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${confirmedOrderId}/cancel`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          reason: "Customer requested cancellation",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Verify order is cancelled
      const order = await prisma.order.findUnique({
        where: { id: confirmedOrderId },
      });
      expect(order?.status).toBe("cancelled");

      // Verify motorcycle is available
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycleId },
      });
      expect(motorcycle?.status).toBe("available");
    });

    it("should reject cancellation of completed order", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${completedOrderId}/cancel`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          reason: "Too late",
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ORDER_CANNOT_BE_CANCELLED");
    });
  });

  describe("Order History", () => {
    let orderId: string;

    beforeEach(async () => {
      await prisma.orderItem.deleteMany();
      await prisma.order.deleteMany();
      await prisma.motorcycle.deleteMany();

      const moto = await prisma.motorcycle.create({
        data: {
          vin: "HISTORY-001",
          model: "Tracer 900",
          year: 2024,
          price: 50000,
          costPrice: 40000,
          brandId,
          categoryId,
          branchId,
          status: "available",
        },
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [moto.id],
          isDraft: false,
        });
      orderId = res.body.data.id;

      // Perform status change
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          status: "processing",
          reason: "Payment received",
        });
    });

    it("should get order history with all status changes", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}/history`)
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2); // Created + status changed

      // Check for creation event
      const createEvent = res.body.data.find(
        (e: any) => e.action === "order:created"
      );
      expect(createEvent).toBeDefined();

      // Check for status change event
      const statusEvent = res.body.data.find(
        (e: any) => e.action === "order:status_changed"
      );
      expect(statusEvent).toBeDefined();
      expect(statusEvent.after.status).toBe("processing");
      expect(statusEvent.after.reason).toBe("Payment received");
    });
  });

  describe("Branch Scoping", () => {
    let branch2Id: string;
    let cashier2Token: string;
    let order1Id: string;
    let order2Id: string;

    beforeEach(async () => {
      // Create second branch
      const branch2 = await prisma.branch.create({
        data: {
          nameAr: "الفرع الثاني",
          nameEn: "Second Branch",
          address: "Second location",
          phone: "+966502222222",
        },
      });
      branch2Id = branch2.id;

      // Find cashier role
      const cashierRole = await prisma.role.findFirst({
        where: { name: "cashier" },
      });

      // Check if cashier2 already exists, if not create
      let cashier2 = await prisma.user.findUnique({
        where: { email: "cashier2@example.com" },
      });

      if (!cashier2) {
        cashier2 = await createStaffUser({
          name: "Cashier Two",
          email: "cashier2@example.com",
          password: "cashier123",
          roleId: cashierRole!.id,
          branchId: branch2Id,
        });
      } else {
        // Update branch
        await prisma.user.update({
          where: { id: cashier2.id },
          data: { branchId: branch2Id },
        });
      }

      cashier2Token = await getAuthToken(app, "cashier2@example.com", "cashier123");

      // Clean up and create motorcycles for each branch
      await prisma.orderItem.deleteMany();
      await prisma.order.deleteMany();
      await prisma.motorcycle.deleteMany();

      const moto1 = await prisma.motorcycle.create({
        data: {
          vin: "BRANCH1-001",
          model: "Branch1 Bike",
          year: 2024,
          price: 30000,
          costPrice: 24000,
          brandId,
          categoryId,
          branchId: branchId,
          status: "available",
        },
      });

      const moto2 = await prisma.motorcycle.create({
        data: {
          vin: "BRANCH2-001",
          model: "Branch2 Bike",
          year: 2024,
          price: 30000,
          costPrice: 24000,
          brandId,
          categoryId,
          branchId: branch2Id,
          status: "available",
        },
      });

      // Create order in branch 1
      const res1 = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId: branchId,
          motorcycleIds: [moto1.id],
          isDraft: false,
        });

      if (res1.body.success && res1.body.data) {
        order1Id = res1.body.data.id;
      }

      // Create order in branch 2
      const res2 = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashier2Token}`)
        .send({
          customerId,
          branchId: branch2Id,
          motorcycleIds: [moto2.id],
          isDraft: false,
        });

      if (res2.body.success && res2.body.data) {
        order2Id = res2.body.data.id;
      }
    });

    it("should only see own branch orders", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].branch.nameEn).toBe("Main Branch");
    });

    it("should reject access to other branch order", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${order2Id}`)
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("BRANCH_SCOPE_VIOLATION");
    });

    it("should allow superadmin to see all orders", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/orders")
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });
});
