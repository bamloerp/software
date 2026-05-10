// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function upsertUser(email: string, role: string, name?: string) {
  const passwordHash = await bcrypt.hash('Password@123', 10);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, role, name: name ?? email.split('@')[0], passwordHash },
  });
}

async function main() {
  const roles = [
    'ADMIN','QS','SENIOR_QS','SALES','SALES_ACCOUNTS',
    'PROJECT_OPERATIONS_OFFICER','PROCUREMENT','ACCOUNTS','SECURITY','DRIVER',
    'ACCOUNTING_CLERK','ACCOUNTING_OFFICER','ACCOUNTING_AUDITOR'
  ];
  for (const r of roles) {
    await upsertUser(`${r.toLowerCase()}@barmlo.com`, r, r.replaceAll('_',' '));
  }
  console.log('Seeded base roles (password: Password@123).');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
