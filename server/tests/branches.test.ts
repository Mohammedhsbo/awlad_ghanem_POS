import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import {
  closeTestApp,
  createRole,
  createStaffUser,
  createTestApp,
  prisma,
  resetDatabase,
  seedBaseData,
} from "./helpers.js";

async function login(app: INestApplication, email: string, password = "password123") {
  const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken as string;
}

describe("branches integration", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedBaseData();
  });

  afterAll(async () => {
    await closeTestApp(app);
    await prisma.$disconnect();
  });

  it("requires authentication for branch routes", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/branches");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("TOKEN_INVALID");
  });

  it("allows super_admin to create, list, read, update, and delete branches", async () => {
    const adminToken = await login(app, "admin@example.com", "admin123");

    const created = await request(app.getHttpServer())
      .post("/api/v1/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        nameAr: "فرع الرياض",
        nameEn: "Riyadh Branch",
        address: "Riyadh Main Street",
        phone: "+966500000001",
      });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      nameAr: "فرع الرياض",
      nameEn: "Riyadh Branch",
      isActive: true,
    });

    const listed = await request(app.getHttpServer())
      .get("/api/v1/branches")
      .query({ page: 1, limit: 10, search: "riyadh" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listed.status).toBe(200);
    expect(listed.body.data.items).toHaveLength(1);
    expect(listed.body.data.items[0]).toMatchObject({
      id: created.body.data.id,
      nameEn: "Riyadh Branch",
    });

    const read = await request(app.getHttpServer())
      .get(`/api/v1/branches/${created.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(read.status).toBe(200);
    expect(read.body.data.id).toBe(created.body.data.id);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/branches/${created.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ address: "Updated Riyadh Street", isActive: false });
    expect(updated.status).toBe(200);
    expect(updated.body.data.address).toBe("Updated Riyadh Street");
    expect(updated.body.data.isActive).toBe(false);

    const deleted = await request(app.getHttpServer())
      .delete(`/api/v1/branches/${created.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ success: true, data: null });
  });

  it("enforces RBAC permissions for branch routes", async () => {
    const branchManagerRole = await createRole("branch_manager", [
      { resource: "branch", action: "read" },
      { resource: "branch", action: "update" },
    ]);
    const branchUser = await createStaffUser({
      name: "Branch Manager",
      email: "branch.manager@example.com",
      roleId: branchManagerRole.id,
      branchId: null,
    });

    const token = await login(app, "branch.manager@example.com", "password123");

    const list = await request(app.getHttpServer())
      .get("/api/v1/branches")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);

    const create = await request(app.getHttpServer())
      .post("/api/v1/branches")
      .set("Authorization", `Bearer ${token}`)
      .send({
        nameAr: "فرع جدة",
        nameEn: "Jeddah Branch",
      });
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe("FORBIDDEN");

    const branchId = branchUser.branchId ?? (await prisma.branch.findFirstOrThrow()).id;
    const read = await request(app.getHttpServer())
      .get(`/api/v1/branches/${branchId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(read.status).toBe(200);
  });
});
