import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

p.$queryRaw`
  SELECT conname, pg_get_constraintdef(oid) as def
  FROM pg_constraint
  WHERE conname LIKE 'Reservation_%'
  ORDER BY conname
`.then((r: any) => {
  console.log('All Reservation constraints in pg_constraint:');
  r.forEach((row: any) => console.log(' -', row.conname, ':', row.def));
  return p.$disconnect();
}).catch((e: any) => { console.error(e.message); p.$disconnect(); });
