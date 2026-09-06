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
  return {
    accessToken: response.body.data.accessToken as string,
    cookie: response.headers["set-cookie"],
  };
}

describe("users integration", () => {
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

  it("requires authentication for user routes", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/users");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("TOKEN_INVALID");
  });

  it("allows super_admin to create, list, read, update, reset password, and delete staff users", async () => {
    const { branch, superAdmin } = await seedLookup();
    const staffRole = await createRole("inventory_clerk", [
      { resource: "user", action: "read" },
      { resource: "motorcycle", action: "read" },
    ]);
    const admin = await login(app, "admin@example.com", "admin123");

    const created = await request(app.getHttpServer())
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        name: "Inventory Clerk",
        email: "clerk@example.com",
        password: "password123",
        phone: "+201000000003",
        roleId: staffRole.id,
        branchId: branch.id,
        lang: "en",
      });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      name: "Inventory Clerk",
      email: "clerk@example.com",
      roleId: staffRole.id,
      branchId: branch.id,
      isActive: true,
    });
    expect(created.body.data.passwordHash).toBeUndefined();

    const listed = await request(app.getHttpServer())
      .get("/api/v1/users")
      .query({ page: 1, limit: 10, search: "clerk", roleId: staffRole.id, branchId: branch.id, isActive: true })
      .set("Authorization", `Bearer ${admin.accessToken}`);

    expect(listed.status).toBe(200);
    expect(listed.body.meta.total).toBe(1);
    expect(listed.body.data[0]).toMatchObject({
      id: created.body.data.id,
      email: "clerk@example.com",
      role: { id: staffRole.id, name: "inventory_clerk" },
      branch: { id: branch.id },
    });

    const read = await request(app.getHttpServer())
      .get(`/api/v1/users/${created.body.data.id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`);
    expect(read.status).toBe(200);
    expect(read.body.data.id).toBe(created.body.data.id);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/users/${created.body.data.id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ name: "Senior Inventory Clerk" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe("Senior Inventory Clerk");

    const reset = await request(app.getHttpServer())
      .post(`/api/v1/users/${created.body.data.id}/reset-password`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ newPassword: "new-password123" });
    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ success: true, data: null });

    const loginWithNewPassword = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      email: "clerk@example.com",
      password: "new-password123",
    });
    expect(loginWithNewPassword.status).toBe(200);

    const deleted = await request(app.getHttpServer())
      .delete(`/api/v1/users/${created.body.data.id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ success: true, data: null });
  });

  it("enforces validation and duplicate email errors on staff creation", async () => {
    const { branch } = await seedLookup();
    const staffRole = await createRole("cashier", [{ resource: "user", action: "read" }]);
    const admin = await login(app, "admin@example.com", "admin123");

    const invalid = await request(app.getHttpServer())
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        name: "",
        email: "bad-email",
        password: "short",
        roleId: staffRole.id,
        branchId: branch.id,
      });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("VALIDATION_FAILED");

    await createStaffUser({
      name: "Existing User",
      email: "existing@example.com",
      roleId: staffRole.id,
      branchId: branch.id,
    });

    const duplicate = await request(app.getHttpServer())
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        name: "Duplicate User",
        email: "EXISTING@example.com",
        password: "password123",
        roleId: staffRole.id,
        branchId: branch.id,
      });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("EMAIL_EXISTS");
  });

  it("enforces RBAC permissions for user routes", async () => {
    const { branch } = await seedLookup();
    const noUserPermissionsRole = await createRole("cashier", [{ resource: "motorcycle", action: "read" }]);
    await createStaffUser({
      name: "Cashier",
      email: "cashier@example.com",
      roleId: noUserPermissionsRole.id,
      branchId: branch.id,
    });
    const cashier = await login(app, "cashier@example.com");

    const response = await request(app.getHttpServer())
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${cashier.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("enforces branch scoping for branch-bound users", async () => {
    const { branch } = await seedLookup();
    const secondBranch = await prisma.branch.create({
      data: {
        nameAr: "Second Branch",
        nameEn: "Second Branch",
      },
    });
    const managerRole = await createRole("branch_manager", [
      { resource: "user", action: "read" },
      { resource: "user", action: "update" },
    ]);

    await createStaffUser({
      name: "Branch One Manager",
      email: "manager@example.com",
      roleId: managerRole.id,
      branchId: branch.id,
    });
    await createStaffUser({
      name: "Branch One User",
      email: "branch-one@example.com",
      roleId: managerRole.id,
      branchId: branch.id,
    });
    const branchTwoUser = await createStaffUser({
      name: "Branch Two User",
      email: "branch-two@example.com",
      roleId: managerRole.id,
      branchId: secondBranch.id,
    });

    const manager = await login(app, "manager@example.com");

    const list = await request(app.getHttpServer())
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${manager.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((user: { email: string }) => user.email)).toContain("branch-one@example.com");
    expect(list.body.data.map((user: { email: string }) => user.email)).not.toContain("branch-two@example.com");

    const scopedQuery = await request(app.getHttpServer())
      .get("/api/v1/users")
      .query({ branchId: secondBranch.id })
      .set("Authorization", `Bearer ${manager.accessToken}`);
    expect(scopedQuery.status).toBe(403);
    expect(scopedQuery.body.error.code).toBe("BRANCH_SCOPE_VIOLATION");

    const readOtherBranch = await request(app.getHttpServer())
      .get(`/api/v1/users/${branchTwoUser.id}`)
      .set("Authorization", `Bearer ${manager.accessToken}`);
    expect(readOtherBranch.status).toBe(403);
    expect(readOtherBranch.body.error.code).toBe("BRANCH_SCOPE_VIOLATION");
  });

  it("protects self role/status and last active super_admin cases", async () => {
    const { branch, superAdmin } = await seedLookup();
    const staffRole = await createRole("inventory_clerk", [{ resource: "user", action: "read" }]);
    const admin = await login(app, "admin@example.com", "admin123");

    const selfRoleChange = await request(app.getHttpServer())
      .patch(`/api/v1/users/${superAdmin.id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ roleId: staffRole.id, branchId: branch.id });

    expect(selfRoleChange.status).toBe(403);
    expect(selfRoleChange.body.error.code).toBe("CANNOT_MODIFY_OWN_ROLE");

    const deactivateLastAdmin = await request(app.getHttpServer())
      .patch(`/api/v1/users/${superAdmin.id}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ isActive: false });

    expect(deactivateLastAdmin.status).toBe(403);
    expect(deactivateLastAdmin.body.error.code).toBe("CANNOT_DEACTIVATE_OWN_ACCOUNT");
  });

  it("returns validation errors for malformed route ids", async () => {
    const admin = await login(app, "admin@example.com", "admin123");
    const response = await request(app.getHttpServer())
      .get("/api/v1/users/not-a-uuid")
      .set("Authorization", `Bearer ${admin.accessToken}`);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });
});

async function seedLookup() {
  const branch = await prisma.branch.findFirstOrThrow({ where: { nameEn: "Main Branch" } });
  const superAdmin = await prisma.user.findFirstOrThrow({ where: { email: "admin@example.com" } });
  return { branch, superAdmin };
}
