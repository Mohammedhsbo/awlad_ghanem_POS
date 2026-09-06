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

describe("Reservations Concurrency Tests", () => {
  let app: INestApplication;
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

    // Create staff role with reservation permissions
    const staffRole = await createRole("reservation_staff_conc", [
      { resource: "reservation", action: "create" },
      { resource: "reservation", action: "read" },
      { resource: "reservation", action: "update" },
      { resource: "reservation", action: "delete" },
    ]);

    // Create staff user
    staffUser = await createStaffUser({
      name: "Staff Concurrent",
      email: "staffconc@example.com",
      password: "staff123",
      roleId: staffRole.id,
      branchId: branchId,
    });
    staffToken = await getAuthToken(app, "staffconc@example.com", "staff123");

    // Create customer
    const customer = await createCustomer({
      name: "Test Customer Concurrent",
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
    // Clean up before each test. Converting a reservation leaves an order and
    // an invoice pointing at the motorcycle, so those have to go first or the
    // motorcycle delete trips a foreign key.
    await prisma.paymentAllocation.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.invoiceItem.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.motorcycle.deleteMany();

    // Create a test motorcycle
    const motorcycle = await prisma.motorcycle.create({
      data: {
        vin: "CONC-VIN-001",
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
    motorcycleId = motorcycle.id;
  });

  describe("Concurrent Reservation Creation", () => {
    it("should handle 10 simultaneous reservation attempts - only 1 succeeds", async () => {
      // Create 10 simultaneous reservation attempts for the same motorcycle
      const promises = Array.from({ length: 10 }, (_, i) =>
        request(app.getHttpServer())
          .post("/api/v1/reservations")
          .set("Authorization", `Bearer ${staffToken}`)
          .send({
            customerId,
            motorcycleId,
            branchId,
            paidAmount: 5000,
            notes: `Attempt ${i + 1}`,
          })
      );

      const results = await Promise.allSettled(promises);

      // Count successes and failures
      const successes = results.filter(
        (r) => r.status === "fulfilled" && r.value.status === 201
      );
      const conflicts = results.filter(
        (r) =>
          r.status === "fulfilled" &&
          (r.value.status === 409 || r.value.status === 404)
      );

      // Exactly 1 should succeed
      expect(successes.length).toBe(1);

      // Others should fail with conflict
      expect(conflicts.length).toBeGreaterThan(0);

      // Verify motorcycle is reserved
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycleId },
      });
      expect(motorcycle?.status).toBe("reserved");

      // Verify exactly 1 reservation exists
      const reservations = await prisma.reservation.count({
        where: { motorcycleId },
      });
      expect(reservations).toBe(1);
    });

    it("should prevent double reservation", async () => {
      // First reservation should succeed
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

      // Second attempt should fail
      const response2 = await request(app.getHttpServer())
        .post("/api/v1/reservations")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          customerId,
          motorcycleId,
          branchId,
          paidAmount: 5000,
        });

      expect(response2.status).toBe(409);
      expect(response2.body.error.code).toBe("MOTORCYCLE_NOT_AVAILABLE");

      // Verify only 1 reservation exists
      const reservations = await prisma.reservation.count({
        where: { motorcycleId },
      });
      expect(reservations).toBe(1);
    });
  });

  describe("Concurrent Cancellation", () => {
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
          reservationNumber: "RES-CONC-001",
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

    it("should handle concurrent cancellation attempts - only 1 succeeds", async () => {
      // Create 5 simultaneous cancellation attempts
      const promises = Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post(`/api/v1/reservations/${reservationId}/cancel`)
          .set("Authorization", `Bearer ${staffToken}`)
          .send({
            reason: "Concurrent test",
          })
      );

      const results = await Promise.allSettled(promises);

      // Count successes
      const successes = results.filter(
        (r) => r.status === "fulfilled" && r.value.status === 201
      );

      // At least 1 should succeed
      expect(successes.length).toBeGreaterThanOrEqual(1);

      // Verify reservation is cancelled
      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
      });
      expect(reservation?.status).toBe("cancelled");

      // Verify motorcycle is available
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycleId },
      });
      expect(motorcycle?.status).toBe("available");
    });
  });

  describe("Conversion vs Cancellation Race", () => {
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
          reservationNumber: "RES-RACE-001",
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

    it("should handle conversion vs cancellation race safely", async () => {
      // Attempt conversion and cancellation simultaneously
      const conversionPromise = request(app.getHttpServer())
        .post(`/api/v1/reservations/${reservationId}/convert`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          notes: "Converting reservation",
        });

      const cancellationPromise = request(app.getHttpServer())
        .post(`/api/v1/reservations/${reservationId}/cancel`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          reason: "Cancelling reservation",
        });

      const [conversionResult, cancellationResult] = await Promise.allSettled([
        conversionPromise,
        cancellationPromise,
      ]);

      // One should succeed, the other should fail with RESERVATION_NOT_ACTIVE
      let successCount = 0;
      let conflictCount = 0;

      if (
        conversionResult.status === "fulfilled" &&
        conversionResult.value.status === 201
      ) {
        successCount++;
      } else if (
        conversionResult.status === "fulfilled" &&
        conversionResult.value.status === 409
      ) {
        conflictCount++;
      }

      if (
        cancellationResult.status === "fulfilled" &&
        cancellationResult.value.status === 201
      ) {
        successCount++;
      } else if (
        cancellationResult.status === "fulfilled" &&
        cancellationResult.value.status === 409
      ) {
        conflictCount++;
      }

      // Exactly one should succeed
      expect(successCount).toBe(1);
      expect(conflictCount).toBe(1);

      // Verify final state is consistent
      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
      });
      expect(reservation?.status).toMatch(/^(converted|cancelled)$/);

      // Verify motorcycle final state
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycleId },
      });

      if (reservation?.status === "converted") {
        expect(motorcycle?.status).toBe("sold");
      } else {
        expect(motorcycle?.status).toBe("available");
      }
    });
  });

  describe("Concurrent Updates", () => {
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
          reservationNumber: "RES-UPDATE-001",
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

    it("should handle concurrent note updates", async () => {
      // Create 3 simultaneous update attempts
      const promises = Array.from({ length: 3 }, (_, i) =>
        request(app.getHttpServer())
          .patch(`/api/v1/reservations/${reservationId}`)
          .set("Authorization", `Bearer ${staffToken}`)
          .send({
            notes: `Updated note ${i + 1}`,
          })
      );

      const results = await Promise.allSettled(promises);

      // All should succeed (notes updates don't conflict)
      const successes = results.filter(
        (r) => r.status === "fulfilled" && r.value.status === 200
      );
      expect(successes.length).toBe(3);

      // Verify reservation still exists and is active
      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
      });
      expect(reservation?.status).toBe("active");
      expect(reservation?.notes).toBeTruthy();
    });
  });

  describe("Database Consistency", () => {
    it("should maintain consistency under high load", async () => {
      // Create multiple motorcycles
      const motorcycles = await Promise.all(
        Array.from({ length: 20 }, async (_, i) => {
          return prisma.motorcycle.create({
            data: {
              vin: `LOAD-VIN-${i.toString().padStart(3, "0")}`,
              model: `Model-${i}`,
              year: 2024,
              price: 50000,
              costPrice: 50000,
              status: "available",
              brandId: brandId,
              categoryId: categoryId,
              branchId: branchId,
            },
          });
        })
      );

      // Create 100 reservation attempts across 20 motorcycles
      const promises = Array.from({ length: 100 }, (_, i) => {
        const targetMotorcycle = motorcycles[i % 20];
        return request(app.getHttpServer())
          .post("/api/v1/reservations")
          .set("Authorization", `Bearer ${staffToken}`)
          .send({
            customerId,
            motorcycleId: targetMotorcycle.id,
            branchId,
            paidAmount: 5000,
          });
      });

      await Promise.allSettled(promises);

      // Verify database consistency
      const reservations = await prisma.reservation.findMany();
      const reservedMotorcycles = await prisma.motorcycle.findMany({
        where: { status: "reserved" },
      });

      // Each motorcycle should have at most 1 reservation
      const motorcycleReservationCount = new Map<string, number>();
      for (const res of reservations) {
        const count = motorcycleReservationCount.get(res.motorcycleId) || 0;
        motorcycleReservationCount.set(res.motorcycleId, count + 1);
      }

      motorcycleReservationCount.forEach((count) => {
        expect(count).toBe(1);
      });

      // Number of reserved motorcycles should match number of reservations
      expect(reservedMotorcycles.length).toBe(reservations.length);

      // Each reservation's motorcycle should be in reserved status
      for (const reservation of reservations) {
        const motorcycle = await prisma.motorcycle.findUnique({
          where: { id: reservation.motorcycleId },
        });
        expect(motorcycle?.status).toBe("reserved");
      }
    });
  });

  describe("Expiration vs Other Operations", () => {
    let reservationId: string;

    beforeEach(async () => {
      await prisma.motorcycle.update({
        where: { id: motorcycleId },
        data: { status: "reserved" },
      });

      // Create expired reservation
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1); // Already expired

      const reservation = await prisma.reservation.create({
        data: {
          reservationNumber: "RES-EXP-001",
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

    it("should handle expiration vs cancellation race", async () => {
      // Run expiration and cancellation simultaneously
      const expirationPromise = request(app.getHttpServer())
        .post("/api/v1/reservations/expire")
        .send({ limit: 100 });

      const cancellationPromise = request(app.getHttpServer())
        .post(`/api/v1/reservations/${reservationId}/cancel`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ reason: "Test" });

      const [expirationResult, cancellationResult] = await Promise.allSettled([
        expirationPromise,
        cancellationPromise,
      ]);

      // At least one should succeed
      const successCount =
        (expirationResult.status === "fulfilled" &&
        expirationResult.value.status === 201
          ? 1
          : 0) +
        (cancellationResult.status === "fulfilled" &&
        cancellationResult.value.status === 201
          ? 1
          : 0);

      expect(successCount).toBeGreaterThanOrEqual(1);

      // Verify final state
      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
      });
      expect(reservation?.status).toMatch(/^(expired|cancelled)$/);

      // Motorcycle should be available
      const motorcycle = await prisma.motorcycle.findUnique({
        where: { id: motorcycleId },
      });
      expect(motorcycle?.status).toBe("available");
    });
  });
});
