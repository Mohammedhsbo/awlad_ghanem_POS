import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { createTestApp, closeTestApp, resetDatabase, seedBaseData, createRole, createStaffUser, prisma } from "./helpers.js";

describe("Motorcycles API", () => {
  let app: INestApplication;
  let adminToken: string;
  let branchId: string;
  let brandId: string;
  let categoryId: string;
  let motorcycleId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase();
    const data = await seedBaseData();
    branchId = data.branch.id;

    // Login as superadmin to get token
    const loginRes = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: "admin@example.com",
        password: "admin123",
      });
    adminToken = loginRes.body.data.accessToken;

    // Create Brand
    const brand = await prisma.brand.create({
      data: { id: "10000000-0000-0000-0000-000000000001", nameAr: "Yamaha", nameEn: "Yamaha" }
    });
    brandId = brand.id;

    // Create Category
    const category = await prisma.category.create({
      data: { id: "20000000-0000-0000-0000-000000000001", nameAr: "Sport", nameEn: "Sport" }
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it("should create a motorcycle", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/motorcycles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        vin: "VN-12345",
        engineNumber: "ENG-12345",
        model: "YZF-R1",
        year: 2024,
        price: 15000,
        costPrice: 12000,
        brandId,
        categoryId,
        branchId,
        status: "available",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.vin).toBe("VN-12345");
    expect(res.body.data.engineNumber).toBe("ENG-12345");
    motorcycleId = res.body.data.id;
  });

  it("should enforce VIN uniqueness", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/motorcycles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        vin: "VN-12345", // Same VIN
        model: "YZF-R6",
        year: 2024,
        price: 13000,
        costPrice: 10000,
        brandId,
        categoryId,
        branchId,
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("VIN_EXISTS");
  });

  it("should list motorcycles with pagination", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/motorcycles?page=1&limit=10")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta.total).toBeGreaterThan(0);
  });

  it("should get a single motorcycle", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/motorcycles/${motorcycleId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(motorcycleId);
  });

  it("should update a motorcycle", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/motorcycles/${motorcycleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        engineNumber: "ENG-UPDATED-12345",
        price: 15500, // Updated price
      });

    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe(15500);
    expect(res.body.data.engineNumber).toBe("ENG-UPDATED-12345");
  });

  it("should enforce valid status transitions", async () => {
    // Current status is 'available'. Try transitioning to 'reserved'.
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/motorcycles/${motorcycleId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "reserved", reason: "Customer hold" });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("reserved");
    expect(res.body.data.previousStatus).toBe("available");
  });

  it("should reject invalid status transitions", async () => {
    // Current is 'reserved'. Try transitioning to 'in_transit' (invalid)
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/motorcycles/${motorcycleId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "in_transit" });
      
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("should prevent concurrent conflicting updates", async () => {
    // Both try to change from 'reserved' to 'sold'.
    // Due to SELECT ... FOR UPDATE, they run sequentially.
    // The first succeeds. The second evaluates on 'sold' state and fails because 'sold' -> 'sold' is invalid.
    
    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/v1/motorcycles/${motorcycleId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "sold" }),
      request(app.getHttpServer())
        .patch(`/api/v1/motorcycles/${motorcycleId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "sold" })
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409); // One should fail with INVALID_TRANSITION
  });

  it("should not allow unauthorized status changes", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/motorcycles/${motorcycleId}/status`)
      .send({ status: "returned" }); // no auth token
    expect(res.status).toBe(401);
  });

  it("should delete a motorcycle", async () => {
    // The shared fixture has been driven to "sold" by the transition tests
    // above, and a sold motorcycle is deliberately not deletable.
    const created = await request(app.getHttpServer())
      .post("/api/v1/motorcycles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        vin: "VN-DELETE-001",
        model: "YZF-R3",
        year: 2024,
        price: 9000,
        costPrice: 7000,
        brandId,
        categoryId,
        branchId,
        status: "available",
      });
    expect(created.status).toBe(201);
    const deletableId = created.body.data.id;

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/motorcycles/${deletableId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify deletion
    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/motorcycles/${deletableId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(getRes.status).toBe(404);
  });
});
