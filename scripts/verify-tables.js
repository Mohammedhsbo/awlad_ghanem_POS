const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const tables = [
    'Inquiry',
    'Sale',
    'SaleRequest',
    'PosInstallment',
    'PosInstallmentPlan',
    'PosReservation',
    'DesktopPermission',
    'DesktopAttendance'
  ];

  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('Inquiry','Sale','SaleRequest','PosInstallment','PosInstallmentPlan','PosReservation','DesktopPermission','DesktopAttendance')
      ORDER BY table_name;
    `);

    const existing = rows.map((row) => row.table_name);
    const missing = tables.filter((table) => !existing.includes(table));

    console.log('TABLES_CHECK');
    console.log('Expected:', tables.join(', '));
    console.log('Existing:', existing.length ? existing.join(', ') : '(none)');
    console.log('Missing:', missing.length ? missing.join(', ') : '(none)');
    console.log('RESULT');
    if (missing.length === 0) {
      console.log('ALL TABLES EXIST');
    } else {
      console.log('MISSING TABLES FOUND');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('VERIFY_TABLES_ERROR');
  console.error(error);
  process.exit(1);
});
