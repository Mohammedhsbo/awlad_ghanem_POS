import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { io, Socket } from "socket.io-client";
import { createTestApp, closeTestApp, resetDatabase, seedBaseData, prisma } from "./helpers.js";

// Note: Test requires the server to be listening on a real port because Socket.IO client connects via TCP, not supertest.
// However, createTestApp() only initializes the app. We need to start it on a random port.

describe("Socket.IO Infrastructure", () => {
  let app: INestApplication;
  let adminToken: string;
  let customerToken: string;
  let serverUrl: string;
  
  let branchId: string;
  let brandId: string;
  let categoryId: string;
  let motorcycleId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase();
    const data = await seedBaseData();
    branchId = data.branch.id;

    // Start app on a random port to allow real socket connections
    await app.listen(0);
    const server = app.getHttpServer();
    const port = server.address().port;
    serverUrl = `http://localhost:${port}`;

    // Get admin token
    const loginRes = await request(server)
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "admin123" });
    adminToken = loginRes.body.data.accessToken;

    // Create a customer user for testing auth failures or customer roles if needed
    const customerUser = await prisma.user.create({
      data: {
        id: "00000000-0000-0000-0000-000000000003",
        name: "Test Customer",
        email: "customer@example.com",
        passwordHash: "hashed",
        roleId: data.customerRole.id,
      }
    });

    const customerLoginReq = await request(server)
      .post("/api/v1/auth/login")
      .send({ email: "customer@example.com", password: "hashed" });
    // In our test environment, we might just mock a token or use the customerToken.
    // Actually, I can just use a random invalid token for failure testing.

    // Create Base Data for Motorcycle
    const brand = await prisma.brand.create({
      data: { id: "10000000-0000-0000-0000-000000000001", nameAr: "Yamaha", nameEn: "Yamaha" }
    });
    brandId = brand.id;

    const category = await prisma.category.create({
      data: { id: "20000000-0000-0000-0000-000000000001", nameAr: "Sport", nameEn: "Sport" }
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  const connectSocket = (token?: string): Promise<Socket> => {
    return new Promise((resolve) => {
      const socket = io(serverUrl, {
        auth: token ? { token } : undefined,
        reconnection: false,
      });
      
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", () => resolve(socket)); // resolve anyway to test error
    });
  };

  it("should reject unauthenticated connections", async () => {
    const socket = await connectSocket();
    expect(socket.connected).toBe(false);
    socket.close();
  });

  it("should reject invalid tokens", async () => {
    const socket = await connectSocket("invalid-token-string");
    expect(socket.connected).toBe(false);
    socket.close();
  });

  it("should connect successfully with a valid token", async () => {
    const socket = await connectSocket(adminToken);
    expect(socket.connected).toBe(true);
    socket.close();
  });

  it("should receive motorcycle lifecycle events", async () => {
    const socket = await connectSocket(adminToken);
    expect(socket.connected).toBe(true);

    const createdPromise = new Promise<any>((resolve) => socket.once("motorcycle:created", resolve));
    const statusChangedPromise = new Promise<any>((resolve) => socket.once("motorcycle:status_changed", resolve));
    const deletedPromise = new Promise<any>((resolve) => socket.once("motorcycle:deleted", resolve));

    // 1. Create Motorcycle (Triggers motorcycle:created)
    const createRes = await request(app.getHttpServer())
      .post("/api/v1/motorcycles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        vin: "VN-WS-TEST",
        model: "WebSocket Test",
        year: 2024,
        price: 15000,
        costPrice: 12000,
        brandId,
        categoryId,
        branchId,
        status: "available",
      });
    
    expect(createRes.status).toBe(201);
    motorcycleId = createRes.body.data.id;

    const createdEvent = await createdPromise;
    expect(createdEvent.motorcycleId).toBe(motorcycleId);
    expect(createdEvent.branchId).toBe(branchId);
    expect(createdEvent.status).toBe("available");

    // 2. Change Status (Triggers motorcycle:status_changed)
    const statusRes = await request(app.getHttpServer())
      .patch(`/api/v1/motorcycles/${motorcycleId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "reserved" });
    
    expect(statusRes.status).toBe(200);

    const statusChangedEvent = await statusChangedPromise;
    expect(statusChangedEvent.motorcycleId).toBe(motorcycleId);
    expect(statusChangedEvent.oldStatus).toBe("available");
    expect(statusChangedEvent.newStatus).toBe("reserved");
    expect(statusChangedEvent.branchId).toBe(branchId);

    // 3. Delete Motorcycle (Triggers motorcycle:deleted)
    // First transition back to available because reserved motorcycles cannot be deleted
    await request(app.getHttpServer())
      .patch(`/api/v1/motorcycles/${motorcycleId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "available" });

    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/motorcycles/${motorcycleId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    
    expect(deleteRes.status).toBe(200);

    const deletedEvent = await deletedPromise;
    expect(deletedEvent.motorcycleId).toBe(motorcycleId);
    expect(deletedEvent.branchId).toBe(branchId);

    socket.close();
  });
});
