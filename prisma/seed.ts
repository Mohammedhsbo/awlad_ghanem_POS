import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const cashierPermissions = [
  ["order", "create"],
  ["order", "read"],
  ["order", "update"],
  ["customer", "read"],
  ["customer", "create"],
  ["customer", "update"],
  ["customer", "delete"],
  ["motorcycle", "create"],
  ["motorcycle", "read"],
  ["motorcycle", "update"],
  ["motorcycle", "delete"],
  ["reservation", "create"],
  ["reservation", "read"],
  ["reservation", "update"],
  ["reservation", "delete"],
  ["report", "read"],
  ["pos", "create"],
] as const;

const salesPermissions = cashierPermissions;

const branchAdminPermissions = [
  ...cashierPermissions,
  ["supplier", "read"],
  ["transfer", "read"],
  ["transfer", "create"],
  ["transfer", "update"],
  ["financing_contract", "read"],
] as const;

async function ensureRole(name: string, description: string, permissions: readonly (readonly [string, string])[]) {
  const role = await prisma.role.upsert({
    where: { name },
    update: { description, isSystem: true },
    create: { name, description, isSystem: true },
  });
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  await prisma.rolePermission.createMany({
    data: permissions.map(([resource, action]) => ({ roleId: role.id, resource, action })),
    skipDuplicates: true,
  });
  return role;
}

async function main() {
  const branch = await prisma.branch.findFirst({ where: { nameEn: "Main Branch" } }) ?? await prisma.branch.create({
    data: { nameAr: "الفرع الرئيسي", nameEn: "Main Branch" },
  });
  const cashierRole = await ensureRole("pos_cashier", "Least-privilege point of sale cashier", cashierPermissions);
  await ensureRole("pos_sales", "Point of sale sales staff", salesPermissions);
  await ensureRole("branch_admin", "Branch operations administrator", branchAdminPermissions);
  const adminRole = await ensureRole("super_admin", "Full system access", []);

  const adminEmail = process.env.POS_ADMIN_EMAIL ?? "admin@manage.com";
  const adminPassword = process.env.POS_ADMIN_PASSWORD ?? "admin123";
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: await bcrypt.hash(adminPassword, 12),
      roleId: adminRole.id,
      branchId: null,
      isActive: true,
    },
    create: {
      name: "Admin",
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      roleId: adminRole.id,
      branchId: null,
      lang: "en",
    },
  });

  const email = process.env.POS_INITIAL_EMAIL ?? "cashier@local.pos";
  const password = process.env.POS_INITIAL_PASSWORD ?? "ChangeMe-Local-123!";
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (!existingUser) {
    await prisma.user.create({
      data: {
        name: "POS Cashier",
        email,
        passwordHash: await bcrypt.hash(password, 12),
        branchId: branch.id,
        roleId: cashierRole.id,
        lang: "ar",
      },
    });
  }
  if (process.env.POS_CREDENTIALS_PATH && !existingUser) writeFileSync(process.env.POS_CREDENTIALS_PATH, JSON.stringify({ email, password }));
  console.log(JSON.stringify({ branch: branch.nameEn, email, password: existingUser ? undefined : password }, null, 2));
}

main().finally(() => prisma.$disconnect());