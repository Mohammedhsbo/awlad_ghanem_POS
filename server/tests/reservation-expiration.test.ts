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

describe("Reservations Expiration Tests", () => {
  let app: INestApplication;
  let branchId: string;
  let brandId: string;
  let categoryId: string;
  let customerId: string;
  let staffUser: any;
  let staffToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase();
    const data = await seedBaseData();
    branchId = data.branch.id;

    // Create staff role
    const staffRole = await createRole("reservation_staff_exp", [
      { resource: "reservation", action: "create" },
      { resource: "reservation", action: "read" },
      { resource: "scheduler", action: "update" },
    ]);

    // Create staff user
    staffUser = await createStaffUser({
      name: "Staff Expiration",
      email: "staffexp@example.com",
      password: "staff123",
      roleId: staffRole.id,
      branchId: branchId,
    });

    // POST /reservations/expire sits behind JwtAuthGuard like the rest of the
    // controller, so the job caller has to present a token.
    staffToken = await getAuthToken(app, "staffexp@example.com", "staff123");

    // Create customer
    const customer = await createCustomer({
      name: "Test Customer Expiration",
      phone: "+966501234567",
    });
    customerId = customer.id;

    // Create Brand
    const brand = await prisma.brand.create({
      data: {
        nameAr: "ياماها",
        nameEn: "Yamaha",
      },
    });
    brandId = brand.id;

    // Create Category
    const category = await prisma.category.create({
      data: {
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
  });

  describe("POST /api/v1/reservations/expire - Batch Expiration", () => {
    it("should expire all active reservations past their expiration date", async () => {
      // Create 5 expired reservations
      const expiredReservations = await Promise.all(
        Array.from({ length: 5 }, async (_, i) => {
          const moto = await prisma.motorcycle.create({
            data: {
              vin: `EXP-VIN-${i}`,
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
          expiresAt.setDate(expiresAt.getDate() - (i + 1)); // Expired 1-5 days ago

          return prisma.reservation.create({
            data: {
              reservationNumber: `RES-EXP-${i}`,
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
        })
      );

      // Create 3 active (not expired) reservations
      await Promise.all(
        Array.from({ length: 3 }, async (_, i) => {
          const moto = await prisma.motorcycle.create({
            data: {
              vin: `ACT-VIN-${i}`,
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
          expiresAt.setDate(expiresAt.getDate() + (i + 1)); // Expires in 1-3 days

          return prisma.reservation.create({
            data: {
              reservationNumber: `RES-ACT-${i}`,
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
        })
      );

      // Run expiration
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations/expire")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ limit: 100 });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.processedCount).toBe(5);
      expect(response.body.data.expiredReservations).toHaveLength(5);

      // Verify expired reservations have status 'expired'
      for (const res of expiredReservations) {
        const updated = await prisma.reservation.findUnique({
          where: { id: res.id },
        });
        expect(updated?.status).toBe("expired");
      }

      // Verify active reservations remain active
      const activeReservations = await prisma.reservation.findMany({
        where: {
          reservationNumber: { startsWith: "RES-ACT" },
        },
      });
      expect(activeReservations).toHaveLength(3);
      activeReservations.forEach((res) => {
        expect(res.status).toBe("active");
      });

      // Verify motorcycles from expired reservations are available
      const expiredMotorcycles = await prisma.motorcycle.findMany({
        where: {
          vin: { startsWith: "EXP-VIN" },
        },
      });
      expiredMotorcycles.forEach((moto) => {
        expect(moto.status).toBe("available");
      });

      // Verify motorcycles from active reservations remain reserved
      const activeMotorcycles = await prisma.motorcycle.findMany({
        where: {
          vin: { startsWith: "ACT-VIN" },
        },
      });
      activeMotorcycles.forEach((moto) => {
        expect(moto.status).toBe("reserved");
      });
    });

    it("should respect batch limit", async () => {
      // Create 10 expired reservations
      await Promise.all(
        Array.from({ length: 10 }, async (_, i) => {
          const moto = await prisma.motorcycle.create({
            data: {
              vin: `LIMIT-VIN-${i}`,
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
          expiresAt.setDate(expiresAt.getDate() - 1);

          return prisma.reservation.create({
            data: {
              reservationNumber: `RES-LIMIT-${i}`,
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
        })
      );

      // Run expiration with limit of 5
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations/expire")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ limit: 5 });

      expect(response.status).toBe(201);
      expect(response.body.data.processedCount).toBeLessThanOrEqual(5);
    });

    it("should not expire cancelled reservations", async () => {
      const moto = await prisma.motorcycle.create({
        data: {
          vin: "CANCELLED-VIN",
          model: "Model",
          year: 2024,
          price: 50000,
          costPrice: 50000,
          status: "available",
          brandId: brandId,
          categoryId: categoryId,
          branchId: branchId,
        },
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1); // Expired

      const reservation = await prisma.reservation.create({
        data: {
          reservationNumber: "RES-CANC-001",
          customerId,
          motorcycleId: moto.id,
          branchId,
          userId: staffUser.id,
          status: "cancelled",
          totalPrice: 50000,
          paidAmount: 5000,
          remainingAmount: 45000,
          expiresAt,
        },
      });

      // Run expiration
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations/expire")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ limit: 100 });

      expect(response.status).toBe(201);
      expect(response.body.data.processedCount).toBe(0);

      // Verify reservation remains cancelled
      const updated = await prisma.reservation.findUnique({
        where: { id: reservation.id },
      });
      expect(updated?.status).toBe("cancelled");
    });

    it("should not expire converted reservations", async () => {
      const moto = await prisma.motorcycle.create({
        data: {
          vin: "CONVERTED-VIN",
          model: "Model",
          year: 2024,
          price: 50000,
          costPrice: 50000,
          status: "sold",
          brandId: brandId,
          categoryId: categoryId,
          branchId: branchId,
        },
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1); // Expired

      const reservation = await prisma.reservation.create({
        data: {
          reservationNumber: "RES-CONV-001",
          customerId,
          motorcycleId: moto.id,
          branchId,
          userId: staffUser.id,
          status: "converted",
          totalPrice: 50000,
          paidAmount: 5000,
          remainingAmount: 45000,
          expiresAt,
        },
      });

      // Run expiration
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations/expire")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ limit: 100 });

      expect(response.status).toBe(201);
      expect(response.body.data.processedCount).toBe(0);

      // Verify reservation remains converted
      const updated = await prisma.reservation.findUnique({
        where: { id: reservation.id },
      });
      expect(updated?.status).toBe("converted");
    });

    it("should handle large batch expiration efficiently", async () => {
      // Create 100 expired reservations
      const startTime = Date.now();

      await Promise.all(
        Array.from({ length: 100 }, async (_, i) => {
          const moto = await prisma.motorcycle.create({
            data: {
              vin: `BATCH-VIN-${i.toString().padStart(3, "0")}`,
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
          expiresAt.setDate(expiresAt.getDate() - 1);

          return prisma.reservation.create({
            data: {
              reservationNumber: `RES-BATCH-${i.toString().padStart(6, "0")}`,
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
        })
      );

      // Run expiration
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations/expire")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ limit: 100 });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.status).toBe(201);
      expect(response.body.data.processedCount).toBe(100);

      // Should process within reasonable time (adjust threshold as needed)
      // This is more of a smoke test than a strict performance test
      expect(duration).toBeLessThan(30000); // 30 seconds

      // Verify all expired
      const expiredCount = await prisma.reservation.count({
        where: {
          status: "expired",
          reservationNumber: { startsWith: "RES-BATCH" },
        },
      });
      expect(expiredCount).toBe(100);

      // Verify all motorcycles available
      const availableCount = await prisma.motorcycle.count({
        where: {
          status: "available",
          vin: { startsWith: "BATCH-VIN" },
        },
      });
      expect(availableCount).toBe(100);
    });

    it("should create audit log entries for each expiration", async () => {
      const moto = await prisma.motorcycle.create({
        data: {
          vin: "AUDIT-VIN",
          model: "Model",
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
      expiresAt.setDate(expiresAt.getDate() - 1);

      const reservation = await prisma.reservation.create({
        data: {
          reservationNumber: "RES-AUDIT-001",
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

      // Run expiration
      await request(app.getHttpServer())
        .post("/api/v1/reservations/expire")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ limit: 100 });

      // Verify audit log entry exists
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          entityType: "reservation",
          entityId: reservation.id,
          action: "reservation:expired",
        },
      });

      expect(auditLog).toBeTruthy();
      expect(auditLog?.userId).toBeNull();
      expect(auditLog?.customerId).toBeNull();
    });

    it("should handle partial failures gracefully", async () => {
      // Create 5 expired reservations
      const reservations = await Promise.all(
        Array.from({ length: 5 }, async (_, i) => {
          const moto = await prisma.motorcycle.create({
            data: {
              vin: `FAIL-VIN-${i}`,
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
          expiresAt.setDate(expiresAt.getDate() - 1);

          return prisma.reservation.create({
            data: {
              reservationNumber: `RES-FAIL-${i}`,
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
        })
      );

      // Manually change one reservation to cancelled before expiration runs
      await prisma.reservation.update({
        where: { id: reservations[2].id },
        data: { status: "cancelled" },
      });

      // Run expiration - should skip the cancelled one
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations/expire")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ limit: 100 });

      expect(response.status).toBe(201);
      // Should process 4 (skipping the cancelled one)
      expect(response.body.data.processedCount).toBe(4);
    });
  });

  describe("Expiration Edge Cases", () => {
    it("should handle reservations without expiration date", async () => {
      const moto = await prisma.motorcycle.create({
        data: {
          vin: "NO-EXP-VIN",
          model: "Model",
          year: 2024,
          price: 50000,
          costPrice: 50000,
          status: "reserved",
          brandId: brandId,
          categoryId: categoryId,
          branchId: branchId,
        },
      });

      await prisma.reservation.create({
        data: {
          reservationNumber: "RES-NO-EXP-001",
          customerId,
          motorcycleId: moto.id,
          branchId,
          userId: staffUser.id,
          status: "active",
          totalPrice: 50000,
          paidAmount: 5000,
          remainingAmount: 45000,
          expiresAt: null, // No expiration
        },
      });

      // Run expiration
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations/expire")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ limit: 100 });

      expect(response.status).toBe(201);
      // Should not process reservation without expiration date
      expect(response.body.data.processedCount).toBe(0);
    });

    it("should handle today expiration correctly", async () => {
      const moto = await prisma.motorcycle.create({
        data: {
          vin: "TODAY-VIN",
          model: "Model",
          year: 2024,
          price: 50000,
          costPrice: 50000,
          status: "reserved",
          brandId: brandId,
          categoryId: categoryId,
          branchId: branchId,
        },
      });

      // Set expiration to 1 second ago
      const expiresAt = new Date(Date.now() - 1000);

      await prisma.reservation.create({
        data: {
          reservationNumber: "RES-TODAY-001",
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

      // Run expiration
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations/expire")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ limit: 100 });

      expect(response.status).toBe(201);
      expect(response.body.data.processedCount).toBe(1);
    });

    it("should not process reservations expiring in the future", async () => {
      const moto = await prisma.motorcycle.create({
        data: {
          vin: "FUTURE-VIN",
          model: "Model",
          year: 2024,
          price: 50000,
          costPrice: 50000,
          status: "reserved",
          brandId: brandId,
          categoryId: categoryId,
          branchId: branchId,
        },
      });

      // Set expiration to 1 hour in the future
      const expiresAt = new Date(Date.now() + 3600000);

      await prisma.reservation.create({
        data: {
          reservationNumber: "RES-FUTURE-001",
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

      // Run expiration
      const response = await request(app.getHttpServer())
        .post("/api/v1/reservations/expire")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ limit: 100 });

      expect(response.status).toBe(201);
      expect(response.body.data.processedCount).toBe(0);
    });
  });

  describe("Performance Tests", () => {
    it("should handle 1000+ reservations batch expiration", async () => {
      // Create 1000 expired reservations
      const batchSize = 100;
      const batches = 10;

      for (let batch = 0; batch < batches; batch++) {
        await Promise.all(
          Array.from({ length: batchSize }, async (_, i) => {
            const index = batch * batchSize + i;
            const moto = await prisma.motorcycle.create({
              data: {
                vin: `PERF-VIN-${index.toString().padStart(4, "0")}`,
                model: `Model-${index}`,
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
            expiresAt.setDate(expiresAt.getDate() - 1);

            return prisma.reservation.create({
              data: {
                reservationNumber: `RES-PERF-${index.toString().padStart(6, "0")}`,
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
          })
        );
      }

      const startTime = Date.now();

      // Process in batches
      let totalProcessed = 0;
      while (totalProcessed < 1000) {
        const response = await request(app.getHttpServer())
          .post("/api/v1/reservations/expire")
        .set("Authorization", `Bearer ${staffToken}`)
          .send({ limit: 100 });

        expect(response.status).toBe(201);
        totalProcessed += response.body.data.processedCount;

        if (response.body.data.processedCount === 0) {
          break;
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(totalProcessed).toBe(1000);

      // Should complete within reasonable time
      console.log(`Processed 1000 expirations in ${duration}ms`);
      expect(duration).toBeLessThan(60000); // 60 seconds

      // Verify all expired
      const expiredCount = await prisma.reservation.count({
        where: {
          status: "expired",
          reservationNumber: { startsWith: "RES-PERF" },
        },
      });
      expect(expiredCount).toBe(1000);
    });
  });
});
