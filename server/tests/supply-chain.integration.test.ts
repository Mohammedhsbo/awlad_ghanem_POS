import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { createTestApp, closeTestApp, resetDatabase, seedBaseData, createRole, createStaffUser, prisma } from "./helpers.js";

describe("Supply Chain Integration (TASK-009)", () => {
  let app: INestApplication;
  
  // Users
  let superAdminToken: string;
  let branch1ManagerToken: string;
  let branch2ManagerToken: string;

  // Global IDs
  let branch1Id: string;
  let branch2Id: string;
  let supplierId: string;
  let purchaseId: string;
  let transferId: string;
  
  // Data tracking for asserts
  let purchaseItemId1: string;
  let purchaseItemId2: string;
  let receivedMoto1: string;
  let receivedMoto2: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase();
    const data = await seedBaseData();
    branch1Id = data.branch.id;

    // Create a second branch
    const branch2 = await prisma.branch.create({
      data: {
        nameAr: "Secondary Branch",
        nameEn: "Secondary Branch",
        address: "Test",
        phone: "+966000000001"
      }
    });
    branch2Id = branch2.id;

    // Setup Super Admin token
    const resAdmin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "admin123" });
    superAdminToken = resAdmin.body.data.accessToken;

    // Create role for Branch Managers
    const managerRole = await createRole("branch_manager", [
      { resource: "supplier", action: "create" },
      { resource: "supplier", action: "read" },
      { resource: "supplier", action: "update" },
      { resource: "purchase", action: "create" },
      { resource: "purchase", action: "read" },
      { resource: "purchase", action: "update" },
      { resource: "transfer", action: "create" },
      { resource: "transfer", action: "read" },
      { resource: "transfer", action: "update" },
    ]);

    // Create Branch 1 Manager
    const b1User = await createStaffUser({
      name: "B1 Manager",
      email: "b1@example.com",
      roleId: managerRole.id,
      branchId: branch1Id,
    });
    const resB1 = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "b1@example.com", password: "password123" });
    branch1ManagerToken = resB1.body.data.accessToken;

    // Create Branch 2 Manager
    const b2User = await createStaffUser({
      name: "B2 Manager",
      email: "b2@example.com",
      roleId: managerRole.id,
      branchId: branch2Id,
    });
    const resB2 = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "b2@example.com", password: "password123" });
    branch2ManagerToken = resB2.body.data.accessToken;
    
    // Create base brand and category for motorcycles
    await prisma.brand.create({ data: { nameAr: "Test Brand", nameEn: "Test Brand", sortOrder: 1 } });
    await prisma.category.create({ data: { nameAr: "Test Cat", nameEn: "Test Cat", sortOrder: 1 } });
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe("1. Suppliers", () => {
    it("should allow super admin to create a supplier with no branch scope", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/suppliers")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({
          name: "Global Supplier",
          contactPerson: "Bob",
          phone: "+123456789",
          email: "bob@global.com"
        });
      expect(res.status).toBe(201);
      supplierId = res.body.data.id;
    });

    it("should allow branch manager to create a supplier", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/suppliers")
        .set("Authorization", `Bearer ${branch1ManagerToken}`)
        .send({
          name: "B1 Supplier",
          contactPerson: "Alice",
          phone: "+987654321",
        });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe("B1 Supplier");
    });
  });

  describe("2. Purchases & Authorization", () => {
    it("should create a draft purchase for Branch 1", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/purchases")
        .set("Authorization", `Bearer ${branch1ManagerToken}`)
        .send({
          supplierId,
          items: [
            { model: "Yamaha MT-07", quantity: 1, unitCost: 7500 },
            { model: "Yamaha R1", quantity: 1, unitCost: 15000 },
          ]
        });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("draft");
      expect(res.body.data.totalAmount).toBe("22500");
      purchaseId = res.body.data.id;
    });

    it("should prevent Branch 2 Manager from ordering Branch 1's purchase", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/purchases/${purchaseId}/order`)
        .set("Authorization", `Bearer ${branch2ManagerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("BRANCH_SCOPE_VIOLATION");
    });

    it("should allow Branch 1 Manager to order their purchase", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/purchases/${purchaseId}/order`)
        .set("Authorization", `Bearer ${branch1ManagerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("ordered");
      
      // Fetch items to get IDs for receiving
      const purchase = await prisma.purchase.findUnique({
        where: { id: purchaseId },
        include: { items: true }
      });
      purchaseItemId1 = purchase!.items[0].id;
      purchaseItemId2 = purchase!.items[1].id;
    });
  });

  describe("3. Receiving & Concurrency", () => {
    it("should successfully receive the first item", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/purchases/${purchaseId}/receive`)
        .set("Authorization", `Bearer ${branch1ManagerToken}`)
        .send({
          items: [
            { purchaseItemId: purchaseItemId1, vin: "VIN-MT07-001" }
          ]
        });
      
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("partially_received");
      expect(res.body.data.receivedMotorcycles).toHaveLength(1);
      receivedMoto1 = res.body.data.receivedMotorcycles[0].id;
    });

    it("should prevent double-receiving the same item and handle race conditions securely", async () => {
      // We will fire 5 simultaneous requests trying to receive the EXACT same item
      // The DB transaction and FOR UPDATE locks must cause 4 of them to fail and 1 to succeed (or all 5 to fail since we just received item 1 above)
      // Actually, since item1 is ALREADY received, all 5 should fail with ITEM_ALREADY_RECEIVED.
      const attempts = Array(5).fill(null).map(() => 
        request(app.getHttpServer())
          .post(`/api/v1/purchases/${purchaseId}/receive`)
          .set("Authorization", `Bearer ${branch1ManagerToken}`)
          .send({
            items: [{ purchaseItemId: purchaseItemId1, vin: "VIN-MT07-002" }] // trying to receive item 1 again
          })
      );

      const results = await Promise.all(attempts);
      for (const res of results) {
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe("ITEM_ALREADY_RECEIVED");
      }
    });

    it("should handle concurrency on receiving the FINAL item (transaction race)", async () => {
      // Now we receive item 2, but fire 3 requests at the exact same time.
      // Only ONE should succeed. The others should fail with ITEM_ALREADY_RECEIVED or VIN_EXISTS.
      const attempts = Array(3).fill(null).map(() => 
        request(app.getHttpServer())
          .post(`/api/v1/purchases/${purchaseId}/receive`)
          .set("Authorization", `Bearer ${branch1ManagerToken}`)
          .send({
            items: [{ purchaseItemId: purchaseItemId2, vin: "VIN-R1-001" }]
          })
      );

      const results = await Promise.all(attempts);
      
      const successes = results.filter(r => r.status === 200);
      const conflicts = results.filter(r => r.status === 409);

      expect(successes).toHaveLength(1);
      expect(conflicts).toHaveLength(2);

      expect(successes[0].body.data.status).toBe("received");
      receivedMoto2 = successes[0].body.data.receivedMotorcycles[0].id;
    });

    it("should rollback transaction if a duplicate VIN is inserted during batch receive", async () => {
      // Create a fresh purchase just to test rollback
      const pRes = await request(app.getHttpServer())
        .post("/api/v1/purchases")
        .set("Authorization", `Bearer ${branch1ManagerToken}`)
        .send({
          supplierId,
          items: [
            { model: "Test A", quantity: 1, unitCost: 100 },
            { model: "Test B", quantity: 1, unitCost: 100 },
          ]
        });
      const pid = pRes.body.data.id;
      
      await request(app.getHttpServer())
        .post(`/api/v1/purchases/${pid}/order`)
        .set("Authorization", `Bearer ${branch1ManagerToken}`);

      const purchase = await prisma.purchase.findUnique({ where: { id: pid }, include: { items: true } });
      const i1 = purchase!.items[0].id;
      const i2 = purchase!.items[1].id;

      // Attempt to receive both, but with a VIN that ALREADY exists from a previous test
      const res = await request(app.getHttpServer())
        .post(`/api/v1/purchases/${pid}/receive`)
        .set("Authorization", `Bearer ${branch1ManagerToken}`)
        .send({
          items: [
            { purchaseItemId: i1, vin: "VIN-NEW-UNIQUE-999" }, // This is fine
            { purchaseItemId: i2, vin: "VIN-R1-001" } // This exists in DB! (Throws P2002/VIN_EXISTS)
          ]
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("VIN_EXISTS");

      // Verify the transaction rolled back and the first VIN was NOT saved
      const checkVin = await prisma.motorcycle.findUnique({ where: { vin: "VIN-NEW-UNIQUE-999" } });
      expect(checkVin).toBeNull();
      
      // The purchase status should still be ordered
      const checkStatus = await prisma.purchase.findUnique({ where: { id: pid } });
      expect(checkStatus?.status).toBe("ordered");
    });
  });

  describe("4. Transfers & Scoping", () => {
    it("should prevent Branch 1 from transferring to itself", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/transfers")
        .set("Authorization", `Bearer ${branch1ManagerToken}`)
        .send({
          toBranchId: branch1Id,
          motorcycleIds: [receivedMoto1]
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("SAME_BRANCH_TRANSFER");
    });

    it("should prevent transferring a motorcycle that is not available (e.g. if we simulate sold)", async () => {
      await prisma.motorcycle.update({ where: { id: receivedMoto1 }, data: { status: "sold" } });

      const res = await request(app.getHttpServer())
        .post("/api/v1/transfers")
        .set("Authorization", `Bearer ${branch1ManagerToken}`)
        .send({
          toBranchId: branch2Id,
          motorcycleIds: [receivedMoto1]
        });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("MOTORCYCLE_NOT_AVAILABLE");

      // Revert
      await prisma.motorcycle.update({ where: { id: receivedMoto1 }, data: { status: "in_transit" } });
    });
    
    it("should fail because motorcycles from purchase receiving are in_transit, not available", async () => {
      // Note: By spec, purchase receiving creates motorcycles as 'in_transit' until someone manually changes them
      // Oh wait, in the transfer spec, they must be 'available' to transfer!
      const res = await request(app.getHttpServer())
        .post("/api/v1/transfers")
        .set("Authorization", `Bearer ${branch1ManagerToken}`)
        .send({
          toBranchId: branch2Id,
          motorcycleIds: [receivedMoto1, receivedMoto2]
        });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("MOTORCYCLE_NOT_AVAILABLE");
      
      // Let's manually set them to available to continue the supply chain flow
      await prisma.motorcycle.updateMany({
        where: { id: { in: [receivedMoto1, receivedMoto2] } },
        data: { status: "available" }
      });
    });

    it("should initiate a transfer successfully", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/transfers")
        .set("Authorization", `Bearer ${branch1ManagerToken}`)
        .send({
          toBranchId: branch2Id,
          motorcycleIds: [receivedMoto1, receivedMoto2]
        });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("initiated");
      transferId = res.body.data.id;
    });

    it("should prevent creating ANOTHER transfer with the same motorcycles (conflict check)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/transfers")
        .set("Authorization", `Bearer ${branch1ManagerToken}`)
        .send({
          toBranchId: branch2Id,
          motorcycleIds: [receivedMoto1]
        });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("MOTORCYCLE_IN_ACTIVE_TRANSFER");
    });
  });

  describe("5. Transfer Transitions & Concurrency", () => {
    it("should prevent Branch 2 from shipping the transfer (only source branch can ship)", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/transfers/${transferId}/ship`)
        .set("Authorization", `Bearer ${branch2ManagerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("BRANCH_SCOPE_VIOLATION");
    });

    it("should safely handle concurrent shipping requests (transaction locking)", async () => {
      // Fire 3 simultaneous ship requests from Branch 1
      const attempts = Array(3).fill(null).map(() => 
        request(app.getHttpServer())
          .post(`/api/v1/transfers/${transferId}/ship`)
          .set("Authorization", `Bearer ${branch1ManagerToken}`)
      );

      const results = await Promise.all(attempts);
      const successes = results.filter(r => r.status === 200);
      const conflicts = results.filter(r => r.status === 409); // INVALID_STATUS_TRANSITION for the losers

      expect(successes).toHaveLength(1);
      expect(conflicts).toHaveLength(2);
      expect(successes[0].body.data.status).toBe("in_transit");

      // Verify motorcycles are marked 'in_transfer'
      const m1 = await prisma.motorcycle.findUnique({ where: { id: receivedMoto1 } });
      expect(m1?.status).toBe("in_transfer");
    });

    it("should prevent Branch 1 from receiving the transfer (only destination branch can receive)", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/transfers/${transferId}/receive`)
        .set("Authorization", `Bearer ${branch1ManagerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("BRANCH_SCOPE_VIOLATION");
    });

    it("should safely handle concurrent receive requests", async () => {
      // Fire 3 simultaneous receive requests from Branch 2
      const attempts = Array(3).fill(null).map(() => 
        request(app.getHttpServer())
          .post(`/api/v1/transfers/${transferId}/receive`)
          .set("Authorization", `Bearer ${branch2ManagerToken}`)
      );

      const results = await Promise.all(attempts);
      const successes = results.filter(r => r.status === 200);
      const conflicts = results.filter(r => r.status === 409); // INVALID_STATUS_TRANSITION for losers

      expect(successes).toHaveLength(1);
      expect(conflicts).toHaveLength(2);
      expect(successes[0].body.data.status).toBe("received");
    });

    it("should verify inventory consistency after full transfer", async () => {
      // Motorcycles should now belong to branch 2 and be available
      const m1 = await prisma.motorcycle.findUnique({ where: { id: receivedMoto1 } });
      const m2 = await prisma.motorcycle.findUnique({ where: { id: receivedMoto2 } });

      expect(m1?.branchId).toBe(branch2Id);
      expect(m1?.status).toBe("available");

      expect(m2?.branchId).toBe(branch2Id);
      expect(m2?.status).toBe("available");
    });
  });
});
