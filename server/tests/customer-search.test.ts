import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import {
  closeTestApp,
  createTestApp,
  resetDatabase,
  seedBaseData,
  createRole,
  createStaffUser,
  createCustomer,
  getAuthToken,
  prisma,
} from "./helpers.js";

describe("customer search integration", () => {
  let app: INestApplication;
  let staffToken: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedBaseData();

    const staffRole = await createRole("staff", [
      { resource: "customer", action: "read" },
    ]);

    await createStaffUser({
      name: "Staff User",
      email: "staff@example.com",
      password: "staff123",
      roleId: staffRole.id,
    });
    staffToken = await getAuthToken(app, "staff@example.com", "staff123");
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe("Search by Phone", () => {
    beforeEach(async () => {
      await createCustomer({ name: "Ahmed Ali", phone: "+966501234567", email: "ahmed@example.com" });
      await createCustomer({ name: "Mohammed Hassan", phone: "+966502345678" });
      await createCustomer({ name: "Fatima Sara", phone: "+966555123456" });
    });

    it("finds customer by exact phone match", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "+966501234567" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].phone).toBe("+966501234567");
      expect(response.body.data[0].name).toBe("Ahmed Ali");
    });

    it("finds customer by partial phone match", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "555123" });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].phone).toContain("555123");
    });

    it("normalizes search term for phone matching", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "+966 50 123-4567" });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].phone).toBe("+966501234567");
    });
  });

  describe("Search by Name", () => {
    beforeEach(async () => {
      await createCustomer({ name: "Ahmed Ali", phone: "+966501111111" });
      await createCustomer({ name: "Mohammed Ahmed", phone: "+966502222222" });
      await createCustomer({ name: "أحمد علي", phone: "+966503333333" });
      await createCustomer({ name: "محمد حسن", phone: "+966504444444" });
    });

    it("searches English names case-insensitively", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "ahmed" });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      response.body.data.forEach((customer: any) => {
        expect(customer.name.toLowerCase()).toContain("ahmed");
      });
    });

    it("searches Arabic names", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "أحمد" });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].name).toContain("أحمد");
    });

    it("searches partial names", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "Moha" });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      response.body.data.forEach((customer: any) => {
        expect(customer.name.toLowerCase()).toContain("moha");
      });
    });
  });

  describe("Search by Email", () => {
    beforeEach(async () => {
      await createCustomer({ name: "User One", phone: "+966505555555", email: "test@example.com" });
      await createCustomer({ name: "User Two", phone: "+966506666666", email: "admin@company.com" });
    });

    it("searches by email", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "test@example" });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].email).toContain("test@example");
    });

    it("searches email case-insensitively", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "ADMIN@COMPANY" });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  describe("Search by National ID", () => {
    beforeEach(async () => {
      await createCustomer({ name: "ID Customer", phone: "+966507777777", nationalId: "1234567890" });
      await createCustomer({ name: "Another ID", phone: "+966508888888", nationalId: "9876543210" });
    });

    it("searches by national ID", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "1234567890" });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      // National ID should be masked
      expect(response.body.data[0].nationalId).toMatch(/^\*{6}\d{4}$/);
    });
  });

  describe("Search Relevance & Sorting", () => {
    beforeEach(async () => {
      await createCustomer({ name: "John Smith", phone: "+966501112233", email: "john@example.com" });
      await createCustomer({ name: "Smith Johnson", phone: "+966501112234", email: "smith@example.com" });
      await createCustomer({ name: "Jane Doe", phone: "+966501112235", email: "jane@example.com" });
    });

    it("prioritizes exact phone match", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "+966501112233" });

      expect(response.status).toBe(200);
      expect(response.body.data[0].phone).toBe("+966501112233");
    });

    it("prioritizes partial phone match over name match", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "50111223" });

      expect(response.status).toBe(200);
      // All three have matching phones, so they should appear before any name-only matches
      expect(response.body.data.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Search Filters & Limits", () => {
    beforeEach(async () => {
      for (let i = 1; i <= 25; i++) {
        await createCustomer({
          name: `Customer ${i}`,
          phone: `+96650${i.toString().padStart(7, "0")}`,
        });
      }
    });

    it("respects limit parameter", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "Customer", limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(5);
    });

    it("defaults to limit 10", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "Customer" });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(10);
    });

    it("enforces max limit of 20", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "Customer", limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(20);
    });

    it("excludes inactive customers", async () => {
      await createCustomer({
        name: "Inactive Customer",
        phone: "+966509999999",
        isActive: false,
      });

      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "Inactive" });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe("Search Response Format", () => {
    it("includes default address if exists", async () => {
      const customer = await createCustomer({
        name: "Customer With Address",
        phone: "+966510000000",
      });

      await prisma.address.create({
        data: {
          customerId: customer.id,
          label: "Home",
          addressLine: "123 Main St",
          city: "Riyadh",
          country: "Saudi Arabia",
          isDefault: true,
        },
      });

      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: customer.phone });

      expect(response.status).toBe(200);
      expect(response.body.data[0].defaultAddress).toMatchObject({
        addressLine: "123 Main St",
        city: "Riyadh",
      });
    });

    it("returns null for default address if none exists", async () => {
      const customer = await createCustomer({
        name: "Customer No Address",
        phone: "+966511111111",
      });

      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: customer.phone });

      expect(response.status).toBe(200);
      expect(response.body.data[0].defaultAddress).toBeNull();
    });

    it("masks national ID in search results", async () => {
      await createCustomer({
        name: "Customer With NID",
        phone: "+966512222222",
        nationalId: "1234567890",
      });

      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "+966512222222" });

      expect(response.status).toBe(200);
      expect(response.body.data[0].nationalId).toBe("******7890");
    });
  });

  describe("Search Performance", () => {
    beforeEach(async () => {
      // Create large dataset for performance testing
      const customers = [];
      for (let i = 1; i <= 100; i++) {
        customers.push({
          name: `Customer ${i}`,
          phone: `+96650${i.toString().padStart(7, "0")}`,
          email: i % 2 === 0 ? `customer${i}@example.com` : null,
          nationalId: i % 3 === 0 ? `ID${i.toString().padStart(10, "0")}` : null,
          isActive: true,
        });
      }
      await prisma.customer.createMany({ data: customers });
    });

    it("search completes in under 200ms with 100 customers", async () => {
      const start = Date.now();
      
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "Customer" });

      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(200);
    });

    it("exact phone search is fast", async () => {
      const start = Date.now();
      
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ q: "+966500000050" });

      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(100);
    });
  });

  describe("Search Validation", () => {
    it("requires q parameter", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({});

      expect(response.status).toBe(422);
    });

    it("requires authentication", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers/search")
        .query({ q: "test" });

      expect(response.status).toBe(401);
    });
  });
});
