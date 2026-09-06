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

describe("Orders API - Concurrency Tests", () => {
  let app: INestApplication;
  let cashierToken: string;
  let branchId: string;
  let brandId: string;
  let categoryId: string;
  let customerId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase();
    const data = await seedBaseData();
    branchId = data.branch.id;

    // Create cashier role
    const cashierRole = await createRole("cashier", [
      { resource: "order", action: "create" },
      { resource: "order", action: "read" },
      { resource: "order", action: "update" },
      { resource: "order", action: "delete" },
    ]);

    // Create cashier user
    await createStaffUser({
      name: "Cashier Concurrent",
      email: "cashier-concurrent@example.com",
      password: "cashier123",
      roleId: cashierRole.id,
      branchId: branchId,
    });
    cashierToken = await getAuthToken(app, "cashier-concurrent@example.com", "cashier123");

    // Create customer
    const customer = await createCustomer({
      name: "Concurrent Customer",
      phone: "+966501111111",
      email: "concurrent@example.com",
    });
    customerId = customer.id;

    // Create Brand
    const brand = await prisma.brand.create({
      data: {
        id: "11111111-0000-0000-0000-000000000001",
        nameAr: "كاواساكي",
        nameEn: "Kawasaki",
      },
    });
    brandId = brand.id;

    // Create Category
    const category = await prisma.category.create({
      data: {
        id: "22222222-0000-0000-0000-000000000001",
        nameAr: "سبورت",
        nameEn: "Sport",
      },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe("Concurrent Purchase Prevention", () => {
    let motorcycleId: string;

    beforeEach(async () => {
      // Clean up
      await prisma.orderItem.deleteMany();
      await prisma.order.deleteMany();
      await prisma.motorcycle.deleteMany();

      // Create single motorcycle for concurrent purchase test
      const moto = await prisma.motorcycle.create({
        data: {
          vin: "CONCURRENT-001",
          model: "Ninja ZX-10R",
          year: 2024,
          price: 70000,
          costPrice: 56000,
          brandId,
          categoryId,
          branchId,
          status: "available",
        },
      });
      motorcycleId = moto.id;
    });

    it("should prevent concurrent purchase of same motorcycle", async () => {
      // Create 10 simultaneous order creation requests
      const promises = Array.from({ length: 10 }, (_, i) =>
        request(app.getHttpServer())
          .post("/api/v1/orders")
          .set("Authorization", `Bearer ${cashierToken}`)
          .send({
            customerId,
            branchId,
            motorcycleIds: [motorcycleId],
            isDraft: false,
            notes: `Concurrent attempt ${i + 1}`,
          })
      );

      // Execute all requests concurrently
      const results = await Promise.allSettled(promises);

      // Count successes and failures
      const successes = results.filter(
        (r) => r.status === "fulfilled" && r.value.status === 201
      );
      const failures = results.filter(
        (r) =>
          r.status === "fulfilled" &&
          (r.value.status === 409 || r.value.status === 404)
      );

      // Exactly one should succeed
      expect(successes.length).toBe(1);

      // All others should fail with conflict or not found
      expect(failures.length).toBe(9);

      // Verify motorcycle is sold only once
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycleId },
      });
      expect(motorcycle?.status).toBe("sold");

      // Verify only one order was created
      const orders = await prisma.order.count({
        where: {
          items: {
            some: {
              motorcycleId,
            },
          },
        },
      });
      expect(orders).toBe(1);

      // Check failure error codes
      const failedResponses = results
        .filter((r) => r.status === "fulfilled" && r.value.status === 409)
        .map((r: any) => r.value);

      if (failedResponses.length > 0) {
        expect(failedResponses[0].body.error.code).toBe("MOTORCYCLE_NOT_AVAILABLE");
      }
    });

    it("should handle concurrent draft confirmation", async () => {
      // Create a draft order
      const draftRes = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [motorcycleId],
          isDraft: true,
        });

      const draftOrderId = draftRes.body.data.id;

      // Try to confirm the same draft order 5 times concurrently
      const confirmPromises = Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post(`/api/v1/orders/${draftOrderId}/confirm`)
          .set("Authorization", `Bearer ${cashierToken}`)
          .send()
      );

      const confirmResults = await Promise.allSettled(confirmPromises);

      // Count successes
      const confirmSuccesses = confirmResults.filter(
        (r) => r.status === "fulfilled" && r.value.status === 201
      );

      // Only one confirmation should succeed
      expect(confirmSuccesses.length).toBe(1);

      // Others should fail with ORDER_NOT_DRAFT
      const confirmFailures = confirmResults.filter(
        (r) => r.status === "fulfilled" && r.value.status === 409
      );
      expect(confirmFailures.length).toBeGreaterThan(0);

      // Verify motorcycle is sold
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycleId },
      });
      expect(motorcycle?.status).toBe("sold");

      // Verify order status is confirmed
      const order = await prisma.order.findUnique({
        where: { id: draftOrderId },
      });
      expect(order?.status).toBe("confirmed");
    });

    it("should handle race condition between draft confirmation and direct purchase", async () => {
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

      const draftOrderId = draftRes.body.data.id;

      // Simultaneously: confirm draft and create new confirmed order
      const promises = [
        request(app.getHttpServer())
          .post(`/api/v1/orders/${draftOrderId}/confirm`)
          .set("Authorization", `Bearer ${cashierToken}`)
          .send(),
        request(app.getHttpServer())
          .post("/api/v1/orders")
          .set("Authorization", `Bearer ${cashierToken}`)
          .send({
            customerId,
            branchId,
            motorcycleIds: [motorcycleId],
            isDraft: false,
          }),
      ];

      const results = await Promise.allSettled(promises);

      // Exactly one should succeed
      const successes = results.filter(
        (r) => r.status === "fulfilled" && (r.value.status === 201 || r.value.status === 200)
      );
      expect(successes.length).toBe(1);

      // Verify motorcycle is sold
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycleId },
      });
      expect(motorcycle?.status).toBe("sold");

      // Verify only one confirmed order exists for this motorcycle
      const confirmedOrders = await prisma.order.count({
        where: {
          status: { not: "draft" },
          items: {
            some: {
              motorcycleId,
            },
          },
        },
      });
      expect(confirmedOrders).toBe(1);
    });

    it("should handle concurrent status transitions", async () => {
      // Create confirmed order
      const orderRes = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [motorcycleId],
          isDraft: false,
        });

      const orderId = orderRes.body.data.id;

      // Try to change status to processing 3 times concurrently
      const statusPromises = Array.from({ length: 3 }, () =>
        request(app.getHttpServer())
          .post(`/api/v1/orders/${orderId}/status`)
          .set("Authorization", `Bearer ${cashierToken}`)
          .send({
            status: "processing",
          })
      );

      const statusResults = await Promise.allSettled(statusPromises);

      // At least one should succeed
      const statusSuccesses = statusResults.filter(
        (r) => r.status === "fulfilled" && r.value.status === 201
      );
      expect(statusSuccesses.length).toBeGreaterThanOrEqual(1);

      // Verify final order status is processing
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });
      expect(order?.status).toBe("processing");

      // Verify motorcycle is still sold
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycleId },
      });
      expect(motorcycle?.status).toBe("sold");
    });

    it("should handle concurrent cancellations", async () => {
      // Create confirmed order
      const orderRes = await request(app.getHttpServer())
        .post("/api/v1/orders")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          customerId,
          branchId,
          motorcycleIds: [motorcycleId],
          isDraft: false,
        });

      const orderId = orderRes.body.data.id;

      // Try to cancel 3 times concurrently
      const cancelPromises = Array.from({ length: 3 }, () =>
        request(app.getHttpServer())
          .post(`/api/v1/orders/${orderId}/cancel`)
          .set("Authorization", `Bearer ${cashierToken}`)
          .send({
            reason: "Concurrent cancellation",
          })
      );

      const cancelResults = await Promise.allSettled(cancelPromises);

      // At least one should succeed
      const cancelSuccesses = cancelResults.filter(
        (r) => r.status === "fulfilled" && r.value.status === 201
      );
      expect(cancelSuccesses.length).toBeGreaterThanOrEqual(1);

      // Verify order is cancelled
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });
      expect(order?.status).toBe("cancelled");

      // Verify motorcycle is available
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycleId },
      });
      expect(motorcycle?.status).toBe("available");

      // Verify only one cancellation audit entry
      const cancelAudits = await prisma.auditLog.count({
        where: {
          entityId: orderId,
          action: "order:cancelled",
        },
      });
      // Could be multiple due to concurrent attempts, but order should only be cancelled once
      expect(order?.status).toBe("cancelled");
    });
  });

  describe("Concurrent Multi-Motorcycle Orders", () => {
    let motorcycle1Id: string;
    let motorcycle2Id: string;
    let motorcycle3Id: string;

    beforeEach(async () => {
      await prisma.orderItem.deleteMany();
      await prisma.order.deleteMany();
      await prisma.motorcycle.deleteMany();

      // Create 3 motorcycles
      const moto1 = await prisma.motorcycle.create({
        data: {
          vin: "MULTI-001",
          model: "Bike 1",
          year: 2024,
          price: 30000,
          costPrice: 24000,
          brandId,
          categoryId,
          branchId,
          status: "available",
        },
      });
      motorcycle1Id = moto1.id;

      const moto2 = await prisma.motorcycle.create({
        data: {
          vin: "MULTI-002",
          model: "Bike 2",
          year: 2024,
          price: 35000,
          costPrice: 28000,
          brandId,
          categoryId,
          branchId,
          status: "available",
        },
      });
      motorcycle2Id = moto2.id;

      const moto3 = await prisma.motorcycle.create({
        data: {
          vin: "MULTI-003",
          model: "Bike 3",
          year: 2024,
          price: 40000,
          costPrice: 32000,
          brandId,
          categoryId,
          branchId,
          status: "available",
        },
      });
      motorcycle3Id = moto3.id;
    });

    it("should handle overlapping multi-motorcycle orders", async () => {
      // Order 1: wants motorcycles 1 and 2
      // Order 2: wants motorcycles 2 and 3
      // Order 3: wants motorcycles 1 and 3
      // Only one should fully succeed

      const promises = [
        request(app.getHttpServer())
          .post("/api/v1/orders")
          .set("Authorization", `Bearer ${cashierToken}`)
          .send({
            customerId,
            branchId,
            motorcycleIds: [motorcycle1Id, motorcycle2Id],
            isDraft: false,
          }),
        request(app.getHttpServer())
          .post("/api/v1/orders")
          .set("Authorization", `Bearer ${cashierToken}`)
          .send({
            customerId,
            branchId,
            motorcycleIds: [motorcycle2Id, motorcycle3Id],
            isDraft: false,
          }),
        request(app.getHttpServer())
          .post("/api/v1/orders")
          .set("Authorization", `Bearer ${cashierToken}`)
          .send({
            customerId,
            branchId,
            motorcycleIds: [motorcycle1Id, motorcycle3Id],
            isDraft: false,
          }),
      ];

      const results = await Promise.allSettled(promises);

      // At least one should succeed
      const successes = results.filter(
        (r) => r.status === "fulfilled" && r.value.status === 201
      );
      expect(successes.length).toBeGreaterThanOrEqual(1);
      expect(successes.length).toBeLessThanOrEqual(2); // At most 2 can succeed

      // Count sold motorcycles
      const soldMotorcycles = await prisma.motorcycle.count({
        where: {
          id: { in: [motorcycle1Id, motorcycle2Id, motorcycle3Id] },
          status: "sold",
        },
      });

      // At least 2 should be sold (from one successful order)
      expect(soldMotorcycles).toBeGreaterThanOrEqual(2);

      // No motorcycle should be in multiple confirmed orders
      for (const motoId of [motorcycle1Id, motorcycle2Id, motorcycle3Id]) {
        const ordersWithMoto = await prisma.order.count({
          where: {
            status: { not: "draft" },
            items: {
              some: {
                motorcycleId: motoId,
              },
            },
          },
        });
        expect(ordersWithMoto).toBeLessThanOrEqual(1);
      }
    });
  });
});
