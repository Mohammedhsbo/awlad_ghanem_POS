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

describe("customers integration", () => {
  let app: INestApplication;
  let staffToken: string;
  let customerToken: string;
  let staffRoleId: string;
  let customerRoleId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    const baseData = await seedBaseData();
    customerRoleId = baseData.customerRole.id;

    // Create staff role with customer permissions
    const staffRole = await createRole("staff", [
      { resource: "customer", action: "create" },
      { resource: "customer", action: "read" },
      { resource: "customer", action: "update" },
      { resource: "customer", action: "delete" },
    ]);
    staffRoleId = staffRole.id;

    // Create staff user
    await createStaffUser({
      name: "Staff User",
      email: "staff@example.com",
      password: "staff123",
      roleId: staffRoleId,
    });
    staffToken = await getAuthToken(app, "staff@example.com", "staff123");

    // Create a customer for testing
    const customer = await createCustomer({
      name: "Test Customer",
      phone: "+966500000001",
      email: "testcustomer@example.com",
      password: "customer123",
    });

    // Get customer token (customers don't have a separate login endpoint, they use auth/login)
    customerToken = await getAuthToken(app, "testcustomer@example.com", "customer123");
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe("Customer Registration", () => {
    it("registers a new customer with all fields", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/customers/register")
        .send({
          name: "New Customer",
          phone: "+966501234567",
          email: "newcustomer@example.com",
          password: "password123",
          nationalId: "1234567890",
          address: {
            label: "Home",
            addressLine: "123 Main St",
            city: "Riyadh",
            region: "Riyadh Region",
            postalCode: "12345",
            country: "Saudi Arabia",
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: "New Customer",
        phone: "+966501234567",
        email: "newcustomer@example.com",
        nationalId: "1234567890",
        isActive: true,
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.passwordHash).toBeUndefined();

      // Verify address was created
      const customer = await prisma.customer.findUnique({
        where: { phone: "+966501234567" },
        include: { addresses: true },
      });
      expect(customer?.addresses).toHaveLength(1);
      expect(customer?.addresses[0].isDefault).toBe(true);
    });

    it("registers without optional address", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/customers/register")
        .send({
          name: "Customer No Address",
          phone: "+966502345678",
          email: "noaddress@example.com",
          password: "password123",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it("rejects duplicate phone", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/customers/register")
        .send({
          name: "Duplicate Phone",
          phone: "+966500000001", // Already exists
          email: "duplicate@example.com",
          password: "password123",
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("PHONE_EXISTS");
    });

    it("rejects duplicate email", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/customers/register")
        .send({
          name: "Duplicate Email",
          phone: "+966503456789",
          email: "testcustomer@example.com", // Already exists
          password: "password123",
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("EMAIL_EXISTS");
    });

    it("rejects duplicate national ID", async () => {
      await createCustomer({
        name: "Customer With NationalID",
        phone: "+966504567890",
        nationalId: "9876543210",
      });

      const response = await request(app.getHttpServer())
        .post("/api/v1/customers/register")
        .send({
          name: "Duplicate NationalID",
          phone: "+966505678901",
          email: "unique@example.com",
          password: "password123",
          nationalId: "9876543210", // Already exists
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("NATIONAL_ID_EXISTS");
    });

    it("normalizes phone number (removes spaces and dashes)", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/customers/register")
        .send({
          name: "Phone Normalize",
          phone: "+966 50 123-4568",
          email: "normalize@example.com",
          password: "password123",
        });

      expect(response.status).toBe(201);
      expect(response.body.data.phone).toBe("+966501234568");
    });
  });

  describe("Staff Customer Creation", () => {
    it("creates customer with staff permissions", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/customers")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          name: "POS Customer",
          phone: "+966506789012",
          email: "pos@example.com",
          nationalId: "1112223334",
          notes: "Walk-in customer",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: "POS Customer",
        phone: "+966506789012",
        email: "pos@example.com",
        nationalId: "1112223334",
        notes: "Walk-in customer",
        isActive: true,
      });
    });

    it("creates customer without email (POS walk-in)", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/customers")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          name: "Walk-in Customer",
          phone: "+966507890123",
        });

      expect(response.status).toBe(201);
      expect(response.body.data.email).toBeNull();
    });

    it("rejects duplicate phone for staff creation", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/customers")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          name: "Duplicate",
          phone: "+966500000001", // Already exists
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("PHONE_EXISTS");
    });

    it("requires authentication", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/customers")
        .send({
          name: "No Auth",
          phone: "+966508901234",
        });

      expect(response.status).toBe(401);
    });
  });

  describe("Customer List & Pagination", () => {
    beforeEach(async () => {
      // Create multiple customers for pagination testing
      for (let i = 1; i <= 25; i++) {
        await createCustomer({
          name: `Customer ${i}`,
          phone: `+96655${i.toString().padStart(7, "0")}`,
          email: i % 2 === 0 ? `customer${i}@example.com` : undefined,
          nationalId: i % 3 === 0 ? `ID${i.toString().padStart(10, "0")}` : undefined,
        });
      }
    });

    it("lists customers with pagination", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(10);
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 10,
        total: 26, // 25 + 1 from beforeEach
        totalPages: 3,
      });
    });

    it("filters by hasEmail", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ hasEmail: true, limit: 100 });

      expect(response.status).toBe(200);
      response.body.data.forEach((customer: any) => {
        expect(customer.email).not.toBeNull();
      });
    });

    it("filters by hasNationalId", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ hasNationalId: true, limit: 100 });

      expect(response.status).toBe(200);
      response.body.data.forEach((customer: any) => {
        expect(customer.nationalId).not.toBeNull();
      });
    });

    it("searches by name", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ search: "Customer 1", limit: 100 });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      response.body.data.forEach((customer: any) => {
        expect(customer.name.toLowerCase()).toContain("customer 1");
      });
    });

    it("sorts by name ascending", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ sort: "name", order: "asc", limit: 100 });

      expect(response.status).toBe(200);
      const names = response.body.data.map((c: any) => c.name);
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });

    it("masks national ID in list view", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers")
        .set("Authorization", `Bearer ${staffToken}`)
        .query({ hasNationalId: true, limit: 10 });

      expect(response.status).toBe(200);
      response.body.data.forEach((customer: any) => {
        if (customer.nationalId) {
          expect(customer.nationalId).toMatch(/^\*{6}\d{4}$/);
        }
      });
    });
  });

  describe("Customer Detail & Privacy", () => {
    it("shows full national ID in detail view for staff", async () => {
      const customer = await createCustomer({
        name: "Customer With NID",
        phone: "+966509012345",
        nationalId: "1234567890",
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer.id}`)
        .set("Authorization", `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.nationalId).toBe("1234567890");
    });

    it("allows customer to view own data", async () => {
      const customer = await prisma.customer.findUnique({
        where: { phone: "+966500000001" },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer!.id}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(customer!.id);
    });

    it("blocks customer from viewing other customer data", async () => {
      const otherCustomer = await createCustomer({
        name: "Other Customer",
        phone: "+966510123456",
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/customers/${otherCustomer.id}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("does not expose password hash", async () => {
      const customer = await prisma.customer.findUnique({
        where: { phone: "+966500000001" },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer!.id}`)
        .set("Authorization", `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.passwordHash).toBeUndefined();
    });

    it("does not show notes to customers", async () => {
      const customer = await prisma.customer.findUnique({
        where: { phone: "+966500000001" },
      });

      await prisma.customer.update({
        where: { id: customer!.id },
        data: { notes: "Staff notes" },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer!.id}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.notes).toBeUndefined();
    });
  });

  describe("Customer Update", () => {
    it("updates customer information", async () => {
      const customer = await createCustomer({
        name: "Update Test",
        phone: "+966511234567",
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/customers/${customer.id}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          name: "Updated Name",
          email: "updated@example.com",
        });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe("Updated Name");
      expect(response.body.data.email).toBe("updated@example.com");
    });

    it("rejects phone conflict on update", async () => {
      const customer = await createCustomer({
        name: "Update Phone",
        phone: "+966512345678",
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/customers/${customer.id}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          phone: "+966500000001", // Already exists
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("PHONE_EXISTS");
    });

    it("allows customer to update own profile", async () => {
      const customer = await prisma.customer.findUnique({
        where: { phone: "+966500000001" },
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/customers/${customer!.id}`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          name: "Self Updated",
        });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe("Self Updated");
    });

    it("blocks customer from updating isActive", async () => {
      const customer = await prisma.customer.findUnique({
        where: { phone: "+966500000001" },
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/customers/${customer!.id}`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          isActive: false,
        });

      expect(response.status).toBe(403);
    });

    it("blocks customer from updating notes", async () => {
      const customer = await prisma.customer.findUnique({
        where: { phone: "+966500000001" },
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/customers/${customer!.id}`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          notes: "Customer trying to set notes",
        });

      expect(response.status).toBe(403);
    });
  });

  describe("Deactivation & Reactivation", () => {
    it("deactivates customer with reason", async () => {
      const customer = await createCustomer({
        name: "Deactivate Test",
        phone: "+966513456789",
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/customers/${customer.id}/deactivate`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          reason: "Payment issues",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const updated = await prisma.customer.findUnique({ where: { id: customer.id } });
      expect(updated?.isActive).toBe(false);
    });

    it("reactivates customer", async () => {
      const customer = await createCustomer({
        name: "Reactivate Test",
        phone: "+966514567890",
        isActive: false,
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/customers/${customer.id}/reactivate`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const updated = await prisma.customer.findUnique({ where: { id: customer.id } });
      expect(updated?.isActive).toBe(true);
    });
  });

  describe("Customer Summary", () => {
    it("returns summary with zero values", async () => {
      const customer = await createCustomer({
        name: "Summary Test",
        phone: "+966515678901",
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer.id}/summary`)
        .set("Authorization", `Bearer ${staffToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        customerId: customer.id,
        totalOrders: 0,
        completedOrders: 0,
        cancelledOrders: 0,
        totalSpent: 0,
        totalPaid: 0,
        outstandingBalance: 0,
        activeReservations: 0,
        expiredReservations: 0,
        activeInstallmentPlans: 0,
        overdueInstallments: 0,
        lastOrderDate: null,
        lastPaymentDate: null,
      });
    });

    it("blocks customers from accessing summary", async () => {
      const customer = await prisma.customer.findUnique({
        where: { phone: "+966500000001" },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customer!.id}/summary`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(response.status).toBe(403);
    });
  });
});
