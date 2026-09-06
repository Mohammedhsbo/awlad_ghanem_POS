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

describe("roles and permissions integration", () => {
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
  });

  it("includes role permissions on login and applies permission changes on the next request", async () => {
    const branch = await prisma.branch.findFirstOrThrow({ where: { nameEn: "Main Branch" } });
    const role = await createRole("branch_manager", [{ resource: "user", action: "read" }]);
    await createStaffUser({
      name: "Branch Manager",
      email: "manager@example.com",
      roleId: role.id,
      branchId: branch.id,
    });

    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      email: "manager@example.com",
      password: "password123",
    });

    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toMatchObject({
      id: role.id,
      name: "branch_manager",
    });
    expect(login.body.data.user.role.permissions).toEqual([{ resource: "user", action: "read" }]);

    const allowed = await request(app.getHttpServer())
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);
    expect(allowed.status).toBe(200);

    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        resource: "user",
        action: "read",
      },
    });

    const deniedAfterPermissionChange = await request(app.getHttpServer())
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);
    expect(deniedAfterPermissionChange.status).toBe(403);
    expect(deniedAfterPermissionChange.body.error.code).toBe("FORBIDDEN");
  });
});
