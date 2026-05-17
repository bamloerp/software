// Direct seed using @prisma/client - no need for pg module
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const log = (msg) => {
  fs.appendFileSync('_seed_log.txt', msg + '\n');
};

async function main() {
  log('Starting seed...');
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.POSTGRES_PRISMA_URL || "postgresql://neondb_owner:npg_nbcLWm3GEwJ2@ep-jolly-sound-anl11hdk-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&connect_timeout=30",
      },
    },
  });

  try {
    const hash = await bcrypt.hash('Password@123', 10);
    log('Hash generated: ' + hash);

    const roles = [
      'ADMIN','QS','SENIOR_QS','SALES','SALES_ACCOUNTS',
      'PROJECT_OPERATIONS_OFFICER','PROCUREMENT','ACCOUNTS','SECURITY','DRIVER',
      'ACCOUNTING_CLERK','ACCOUNTING_OFFICER','ACCOUNTING_AUDITOR'
    ];

    for (const r of roles) {
      const email = `${r.toLowerCase()}@barmlo.com`;
      const name = r.replaceAll('_', ' ');
      try {
        const user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: { email, role: r, name, passwordHash: hash },
        });
        log(`  OK: ${user.email} (${user.role})`);
      } catch (err) {
        log(`  ERR ${email}: ${err.message}`);
      }
    }

    log('Done! All users seeded with password: Password@123');
  } catch (err) {
    log('FATAL: ' + err.message);
  } finally {
    await prisma.$disconnect();
    log('Disconnected.');
  }
}

// Clear log
fs.writeFileSync('_seed_log.txt', '');
main();
