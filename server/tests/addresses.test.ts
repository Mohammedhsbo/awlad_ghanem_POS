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

describe("addresses integration", () => {
  let app: INestApplication;
  let staffToken: string;
  let customerToken: string;
  let customerId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedBaseData();

    // Create staff role
    const staffRole = await createRole("staff", [
      { resource: "customer", action: "create" },
      { resource: "customer", action: "read" },
      { resource: "customer", action: "update" },
      { resource: "customer", action: "delete" },
    ]);

    await createStaffUser({
      name: "Staff User",
      email: "staff@example.com",
      password: "staff123",
      roleId: staffRole.id,
    });
    staffToken = await getAuthToken(app, "staff@example.com", "staff123");

    // Create customer
    const customer = await createCustomer({
      name: "Test Customer",
      phone: "+966500000001",
      email: "testcustomer@example.com",
      password: "customer123",
    });
    customerId = customer.id;
    customerToken = await getAuthToken(app, "testcustomer@example.com", "customer123");
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe("Add Address", () => {
    it("adds first address and sets as default", async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/customers/${customerId}/addresses`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          label: "Home",
          addressLine: "123 Main St",
          city: "Riyadh",
          region: "Riyadh Region",
          postalCode: "12345",
          country: "Saudi Arabia",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        label: "Home",
        addressLine: "123 Main St",
        city: "Riyadh",
        isDefault: true,
      });
    });

    it("adds second address with default flag unset", async () => {
      // Add first address
      await request(app.getHttpServer())
        .post(`/api/v1/customers/${customerId}/addresses`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          label: "Home",
          addressLine: "123 Main St",
          city: "Riyadh",
        });

      // Add second address
      const response = await request(app.getHttpServer())
        .post(`/api/v1/customers/${customerId}/addresses`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          label: "Office",
          addressLine: "456 Business Ave",
          city: "Jeddah",
        });

      expect(response.status).toBe(201);
      expect(response.body.data.isDefault).toBe(false);

      // Verify first address is still default
      const addresses = await prisma.address.findMany({
        where: { customerId },
        orderBy: { createdAt: "asc" },
      });
      expect(addresses[0].isDefault).toBe(true);
      expect(addresses[1].isDefault).toBe(false);
    });

    it("adds second address with explicit default flag and unsets first", async () => {
      // Add first address
      await request(app.getHttpServer())
        .post(`/api/v1/customers/${customerId}/addresses`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          label: "Home",
          addressLine: "123 Main St",
          city: "Riyadh",
        });

      // Add second address as default
      const response = await request(app.getHttpServer())
        .post(`/api/v1/customers/${customerId}/addresses`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          label: "Office",
          addressLine: "456 Business Ave",
          city: "Jeddah",
          isDefault: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.isDefault).toBe(true);

      // Verify only one default
      const addresses = await prisma.address.findMany({
        where: { customerId },
      });
      const defaultCount = addresses.filter((a) => a.isDefault).length;
      expect(defaultCount).toBe(1);
      expect(addresses[1].isDefault).toBe(true);
    });

    it("staff can add address for customer", async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/customers/${customerId}/addresses`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({
          label: "Home",
          addressLine: "789 Staff Added",
          city: "Dammam",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it("blocks customer from adding address to another customer", async () => {
      const otherCustomer = await createCustomer({
        name: "Other Customer",
        phone: "+966501234567",
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/customers/${otherCustomer.id}/addresses`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          label: "Home",
          addressLine: "Unauthorized",
        });

      expect(response.status).toBe(403);
    });
  });

  describe("List Addresses", () => {
    beforeEach(async () => {
      // Add multiple addresses
      await prisma.address.createMany({
        data: [
          {
            customerId,
            label: "Home",
            addressLine: "123 Main St",
            city: "Riyadh",
            country: "Saudi Arabia",
            isDefault: true,
          },
          {
            customerId,
            label: "Office",
            addressLine: "456 Business Ave",
            city: "Jeddah",
            country: "Saudi Arabia",
            isDefault: false,
          },
          {
            customerId,
            label: "Villa",
            addressLine: "789 Luxury Rd",
            city: "Mecca",
            country: "Saudi Arabia",
            isDefault: false,
          },
        ],
      });
    });

    it("lists all customer addresses sorted by default first", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customerId}/addresses`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.data[0].isDefault).toBe(true);
      expect(response.body.data[0].label).toBe("Home");
    });

    it("blocks customer from listing another customer addresses", async () => {
      const otherCustomer = await createCustomer({
        name: "Other Customer",
        phone: "+966502345678",
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/customers/${otherCustomer.id}/addresses`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe("Update Address", () => {
    let addressId: string;

    beforeEach(async () => {
      const address = await prisma.address.create({
        data: {
          customerId,
          label: "Home",
          addressLine: "123 Main St",
          city: "Riyadh",
          country: "Saudi Arabia",
          isDefault: true,
        },
      });
      addressId = address.id;
    });

    it("updates address fields", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/customers/${customerId}/addresses/${addressId}`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          label: "Updated Home",
          city: "Jeddah",
        });

      expect(response.status).toBe(200);
      expect(response.body.data.label).toBe("Updated Home");
      expect(response.body.data.city).toBe("Jeddah");
    });

    it("changes default address", async () => {
      // Add second address
      const secondAddress = await prisma.address.create({
        data: {
          customerId,
          label: "Office",
          addressLine: "456 Business Ave",
          city: "Dammam",
          country: "Saudi Arabia",
          isDefault: false,
        },
      });

      // Make second address default
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/customers/${customerId}/addresses/${secondAddress.id}`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          isDefault: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.isDefault).toBe(true);

      // Verify first address is no longer default
      const firstAddress = await prisma.address.findUnique({ where: { id: addressId } });
      expect(firstAddress?.isDefault).toBe(false);
    });
  });

  describe("Delete Address", () => {
    it("deletes non-default address when others exist", async () => {
      const address1 = await prisma.address.create({
        data: {
          customerId,
          label: "Home",
          addressLine: "123 Main St",
          country: "Saudi Arabia",
          isDefault: true,
        },
      });

      const address2 = await prisma.address.create({
        data: {
          customerId,
          label: "Office",
          addressLine: "456 Business Ave",
          country: "Saudi Arabia",
          isDefault: false,
        },
      });

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/customers/${customerId}/addresses/${address2.id}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const remaining = await prisma.address.findMany({ where: { customerId } });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(address1.id);
    });

    it("blocks deleting default address when other addresses exist", async () => {
      const address1 = await prisma.address.create({
        data: {
          customerId,
          label: "Home",
          addressLine: "123 Main St",
          country: "Saudi Arabia",
          isDefault: true,
        },
      });

      await prisma.address.create({
        data: {
          customerId,
          label: "Office",
          addressLine: "456 Business Ave",
          country: "Saudi Arabia",
          isDefault: false,
        },
      });

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/customers/${customerId}/addresses/${address1.id}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CANNOT_DELETE_DEFAULT_ADDRESS");
    });

    it("allows deleting the last address", async () => {
      const address = await prisma.address.create({
        data: {
          customerId,
          label: "Home",
          addressLine: "123 Main St",
          country: "Saudi Arabia",
          isDefault: true,
        },
      });

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/customers/${customerId}/addresses/${address.id}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const remaining = await prisma.address.findMany({ where: { customerId } });
      expect(remaining).toHaveLength(0);
    });

    it("promotes another address when deleting default (if implementation changes)", async () => {
      // This test documents the expected behavior even though current implementation blocks it
      // If implementation changes to allow deletion with auto-promotion, this would verify it
      const address1 = await prisma.address.create({
        data: {
          customerId,
          label: "Home",
          addressLine: "123 Main St",
          country: "Saudi Arabia",
          isDefault: true,
        },
      });

      const address2 = await prisma.address.create({
        data: {
          customerId,
          label: "Office",
          addressLine: "456 Business Ave",
          country: "Saudi Arabia",
          isDefault: false,
        },
      });

      // Current implementation: should return 409
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/customers/${customerId}/addresses/${address1.id}`)
        .set("Authorization", `Bearer ${customerToken}`);

      expect(response.status).toBe(409);
      
      // If implementation changes to allow with auto-promotion:
      // expect(response.status).toBe(200);
      // const remaining = await prisma.address.findUnique({ where: { id: address2.id } });
      // expect(remaining?.isDefault).toBe(true);
    });
  });
});
