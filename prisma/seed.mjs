import prismaClientPackage from "@prisma/client";
import bcrypt from "bcrypt";
import { writeFileSync } from "node:fs";

const { PrismaClient } = prismaClientPackage;
const prisma = new PrismaClient();
const cashierPermissions = [
  ["order", "create"], ["order", "read"], ["order", "update"], ["customer", "read"], ["customer", "create"],
  ["customer", "update"], ["customer", "delete"], ["motorcycle", "create"], ["motorcycle", "read"],
  ["motorcycle", "update"], ["motorcycle", "delete"], ["reservation", "create"], ["reservation", "read"],
  ["reservation", "update"], ["reservation", "delete"], ["report", "read"], ["pos", "create"],
];

async function role(name, description, permissions) {
  const result = await prisma.role.upsert({ where: { name }, update: { description, isSystem: true }, create: { name, description, isSystem: true } });
  await prisma.rolePermission.deleteMany({ where: { roleId: result.id } });
  await prisma.rolePermission.createMany({ data: permissions.map(([resource, action]) => ({ roleId: result.id, resource, action })), skipDuplicates: true });
  return result;
}

const branch = await prisma.branch.findFirst({ where: { nameEn: "Main Branch" } }) ?? await prisma.branch.create({ data: { nameAr: "الفرع الرئيسي", nameEn: "Main Branch" } });
const cashier = await role("pos_cashier", "Least-privilege point of sale cashier", cashierPermissions);
await role("pos_sales", "Point of sale sales staff", cashierPermissions);
const admin = await role("super_admin", "Full system access", []);
const adminEmail = process.env.POS_ADMIN_EMAIL ?? "admin@manage.com";
const adminPassword = process.env.POS_ADMIN_PASSWORD ?? "admin123";
await prisma.user.upsert({
  where: { email: adminEmail },
  update: { passwordHash: await bcrypt.hash(adminPassword, 12), roleId: admin.id, branchId: null, isActive: true },
  create: { name: "Admin", email: adminEmail, passwordHash: await bcrypt.hash(adminPassword, 12), roleId: admin.id, branchId: null, lang: "en" },
});
const email = process.env.POS_INITIAL_EMAIL ?? "cashier@local.pos";
const password = process.env.POS_INITIAL_PASSWORD ?? "ChangeMe-Local-123!";
const existing = await prisma.user.findUnique({ where: { email } });
if (!existing) await prisma.user.create({ data: { name: "POS Cashier", email, passwordHash: await bcrypt.hash(password, 12), branchId: branch.id, roleId: cashier.id, lang: "ar" } });
if (process.env.POS_CREDENTIALS_PATH && !existing) writeFileSync(process.env.POS_CREDENTIALS_PATH, JSON.stringify({ email, password }));
console.log(JSON.stringify({ branch: branch.nameEn, email, password: existing ? undefined : password }, null, 2));
await prisma.$disconnect();