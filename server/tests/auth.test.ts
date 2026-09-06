import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { closeTestApp, createTestApp, resetDatabase, seedBaseData } from "./helpers.js";

describe("auth integration", () => {
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

  it("registers a customer and rejects duplicate email or phone", async () => {
    const response = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      name: "Customer One",
      phone: "+201000000001",
      email: "customer@example.com",
      password: "password123",
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        name: "Customer One",
        email: "customer@example.com",
        phone: "+201000000001",
      },
    });
    expect(response.body.data.passwordHash).toBeUndefined();

    const duplicateEmail = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      name: "Customer Two",
      phone: "+201000000002",
      email: "CUSTOMER@example.com",
      password: "password123",
    });
    expect(duplicateEmail.status).toBe(409);
    expect(duplicateEmail.body.error.code).toBe("EMAIL_EXISTS");

    const duplicatePhone = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      name: "Customer Three",
      phone: "+201000000001",
      email: "customer3@example.com",
      password: "password123",
    });
    expect(duplicatePhone.status).toBe(409);
    expect(duplicatePhone.body.error.code).toBe("PHONE_EXISTS");
  });

  it("returns validation errors for invalid registration payloads", async () => {
    const response = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      name: "",
      phone: "+201000000001",
      email: "not-an-email",
      password: "short",
    });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("logs in with valid credentials and returns role permissions plus refresh cookie", async () => {
    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      email: "admin@example.com",
      password: "admin123",
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.user.role.permissions).toEqual(
      expect.arrayContaining([expect.objectContaining({ resource: "user", action: "create" })]),
    );
    expect(response.headers["set-cookie"]?.[0]).toContain("refreshToken=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Strict");
  });

  it("rejects invalid credentials with a generic error", async () => {
    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      email: "missing@example.com",
      password: "wrong-password",
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(response.body.error.message).toBe("Invalid credentials");
  });

  it("refreshes tokens, rejects refresh token reuse, and serves current profile", async () => {
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      email: "admin@example.com",
      password: "admin123",
    });
    const oldCookie = login.headers["set-cookie"];

    const refresh = await request(app.getHttpServer()).post("/api/v1/auth/refresh").set("Cookie", oldCookie);
    expect(refresh.status).toBe(200);
    expect(refresh.body.data.accessToken).toEqual(expect.any(String));
    expect(refresh.headers["set-cookie"]?.[0]).toContain("refreshToken=");

    const reused = await request(app.getHttpServer()).post("/api/v1/auth/refresh").set("Cookie", oldCookie);
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe("TOKEN_INVALID");

    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${refresh.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe("admin@example.com");
    expect(me.body.data.passwordHash).toBeUndefined();
  });

  it("logs out and invalidates the refresh token", async () => {
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      email: "admin@example.com",
      password: "admin123",
    });

    const logout = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .set("Cookie", login.headers["set-cookie"]);

    expect(logout.status).toBe(200);
    expect(logout.body).toEqual({ success: true, data: null });
    expect(logout.headers["set-cookie"]?.[0]).toContain("refreshToken=");

    const refresh = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", login.headers["set-cookie"]);
    expect(refresh.status).toBe(401);
  });
});
