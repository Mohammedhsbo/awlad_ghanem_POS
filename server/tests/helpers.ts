import cookieParser from "cookie-parser";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module.js";
import { RedisIoAdapter } from "../src/socket/index.js";
import { AppExceptionFilter } from "../src/common/filters/app-exception.filter.js";
import { hashPassword } from "../src/utils/password.js";

export const prisma = new PrismaClient();

export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  app.useGlobalFilters(new AppExceptionFilter());

  // Socket.IO auth lives in this adapter, so without it the tests would talk to
  // an unauthenticated gateway that production never exposes.
  const socketAdapter = new RedisIoAdapter(app);
  await socketAdapter.connectToRedis();
  app.useWebSocketAdapter(socketAdapter);

  await app.init();

  return app;
}

export async function closeTestApp(app: INestApplication | undefined) {
  await app?.close();
}

export async function resetDatabase() {
  await prisma.$transaction([
    prisma.notificationDelivery.deleteMany(),
    prisma.notificationPreference.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.communicationLog.deleteMany(),
    prisma.auditLog.deleteMany(),

    prisma.paymentAllocation.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),

    prisma.letterHistory.deleteMany(),
    prisma.letterDocument.deleteMany(),
    prisma.letter.deleteMany(),

    prisma.installment.deleteMany(),
    prisma.financingContract.deleteMany(),

    prisma.desktopReservation.deleteMany(),
    prisma.desktopOrderItem.deleteMany(),
    prisma.desktopOrder.deleteMany(),
    prisma.reservation.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),

    prisma.transferItem.deleteMany(),
    prisma.purchaseItem.deleteMany(),
    prisma.transfer.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.supplier.deleteMany(),

    prisma.posInstallmentPlan.deleteMany(),
    prisma.saleRequest.deleteMany(),
    prisma.posReservation.deleteMany(),
    prisma.customerInquiry.deleteMany(),
    prisma.address.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.motorcycle.deleteMany(),

    prisma.integrationWebhookEvent.deleteMany(),
    prisma.integrationAudit.deleteMany(),
    prisma.integrationLog.deleteMany(),
    prisma.webhookEndpoint.deleteMany(),
    prisma.aPIKey.deleteMany(),
    prisma.integration.deleteMany(),
    prisma.externalProvider.deleteMany(),

    prisma.featureFlag.deleteMany(),
    prisma.configurationAudit.deleteMany(),
    prisma.branchConfiguration.deleteMany(),
    prisma.documentNumbering.deleteMany(),
    prisma.workingHours.deleteMany(),
    prisma.holiday.deleteMany(),
    prisma.companyConfiguration.deleteMany(),
    prisma.systemConfiguration.deleteMany(),

    prisma.idempotencyKey.deleteMany(),
    prisma.outbox.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.notificationTemplate.deleteMany(),

    prisma.user.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.role.deleteMany(),
    prisma.category.updateMany({ data: { parentId: null } }),
    prisma.category.deleteMany(),
    prisma.brand.deleteMany(),
    prisma.branch.deleteMany(),
  ]);
}

export async function seedBaseData() {
  const branch = await prisma.branch.create({
    data: {
      id: "00000000-0000-0000-0000-000000000001",
      nameAr: "Main Branch",
      nameEn: "Main Branch",
      address: "Default branch",
      phone: "+966000000000",
    },
  });

  const superAdminRole = await prisma.role.create({
    data: {
      name: "super_admin",
      description: "Full system access",
      isSystem: true,
      permissions: {
        create: [
          { resource: "user", action: "create" },
          { resource: "user", action: "read" },
          { resource: "user", action: "update" },
          { resource: "user", action: "delete" },
          { resource: "role", action: "read" },
        ],
      },
    },
  });

  const customerRole = await prisma.role.create({
    data: {
      name: "customer",
      description: "E-commerce customer",
      isSystem: true,
    },
  });

  const superAdmin = await prisma.user.create({
    data: {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Super Admin",
      email: "admin@example.com",
      passwordHash: await hashPassword("admin123"),
      roleId: superAdminRole.id,
      branchId: null,
      lang: "en",
    },
  });

  return { branch, superAdminRole, customerRole, superAdmin };
}

export async function createRole(name: string, permissions: Array<{ resource: string; action: string }>) {
  return prisma.role.create({
    data: {
      name,
      description: `${name} test role`,
      permissions: {
        create: permissions,
      },
    },
  });
}

export async function createStaffUser(input: {
  name: string;
  email: string;
  password?: string;
  roleId: string;
  branchId?: string | null;
  isActive?: boolean;
}) {
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password ?? "password123"),
      roleId: input.roleId,
      branchId: input.branchId ?? null,
      isActive: input.isActive ?? true,
      lang: "en",
    },
  });
}

export async function createCustomer(input: {
  name: string;
  phone: string;
  email?: string;
  password?: string;
  nationalId?: string;
  notes?: string;
  isActive?: boolean;
}) {
  return prisma.customer.create({
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email?.toLowerCase() || null,
      passwordHash: input.password ? await hashPassword(input.password) : null,
      nationalId: input.nationalId || null,
      notes: input.notes || null,
      isActive: input.isActive ?? true,
    },
  });
}

export async function getAuthToken(app: INestApplication, email: string, password: string): Promise<string> {
  const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
    email,
    password,
  });

  return response.body.data.accessToken;
}

