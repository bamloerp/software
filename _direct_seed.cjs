// Direct seed script using pg module - bypasses Prisma CLI connectivity issues
const { Client } = require('pg');

const connectionString = process.env.POSTGRES_PRISMA_URL 
  || "postgresql://neondb_owner:npg_nbcLWm3GEwJ2@ep-jolly-sound-anl11hdk-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  console.log("Connecting to:", connectionString.replace(/:[^@]+@/, ':***@'));
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  
  try {
    await client.connect();
    console.log("Connected successfully!");
    
    // Check if User table exists
    const tableCheck = await client.query(
      `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='User')`
    );
    console.log("User table exists:", tableCheck.rows[0].exists);
    
    if (!tableCheck.rows[0].exists) {
      console.log("ERROR: User table doesn't exist. You need to run 'prisma db push' first.");
      console.log("Try running this from a machine that can connect, or use the Vercel deployment.");
      process.exit(1);
    }
    
    // bcryptjs hash of "Password@123" (pre-computed)
    const hash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
    
    const roles = [
      'ADMIN','QS','SENIOR_QS','SALES','SALES_ACCOUNTS',
      'PROJECT_OPERATIONS_OFFICER','PROCUREMENT','ACCOUNTS','SECURITY','DRIVER',
      'ACCOUNTING_CLERK','ACCOUNTING_OFFICER','ACCOUNTING_AUDITOR'
    ];
    
    for (const r of roles) {
      const email = `${r.toLowerCase()}@barmlo.com`;
      const name = r.replaceAll('_', ' ');
      const id = require('crypto').randomUUID();
      
      const res = await client.query(
        `INSERT INTO "User" (id, email, role, name, "passwordHash", "createdAt")
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (email) DO NOTHING
         RETURNING email`,
        [id, email, r, name, hash]
      );
      
      if (res.rowCount > 0) {
        console.log(`  Created: ${email} (${r})`);
      } else {
        console.log(`  Exists:  ${email} (${r})`);
      }
    }
    
    console.log("\nDone! All users seeded with password: Password@123");
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
