const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '_seed_result.txt');
const log = (msg) => { fs.appendFileSync(OUT, msg + '\n'); };

// Clear output
fs.writeFileSync(OUT, 'Script started at ' + new Date().toISOString() + '\n');

const NEON_HOST = 'ep-jolly-sound-anl11hdk-pooler.c-6.us-east-1.aws.neon.tech';
const CONN_STR = 'postgresql://neondb_owner:npg_nbcLWm3GEwJ2@' + NEON_HOST + '/neondb?sslmode=require';

function neonQuery(sql, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql, params: params || [] });
    const req = https.request({
      hostname: NEON_HOST, port: 443, path: '/sql', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': CONN_STR,
        'Neon-Pool-Opt-In': 'true',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        log('HTTP ' + res.statusCode + ': ' + data.substring(0, 500));
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
        } else {
          reject(new Error('HTTP ' + res.statusCode + ': ' + data));
        }
      });
    });
    req.on('error', (e) => { log('REQ ERROR: ' + e.message); reject(e); });
    req.on('timeout', () => { req.destroy(); log('TIMEOUT'); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function main() {
  log('Step 1: Test connection...');
  const test = await neonQuery('SELECT 1 as ok');
  log('Connection OK: ' + JSON.stringify(test.rows));

  log('Step 2: Check tables...');
  const tables = await neonQuery("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const tableNames = tables.rows.map(r => r.tablename);
  log('Tables found: ' + tableNames.join(', '));

  const hasUserTable = tableNames.includes('User');
  log('User table exists: ' + hasUserTable);

  if (!hasUserTable) {
    log('ERROR: User table does not exist. You need to run prisma db push first.');
    log('Since we cannot do that from here, creating just the User table...');
    
    await neonQuery(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT NOT NULL,
        "name" TEXT,
        "email" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'QS',
        "office" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "passwordHash" TEXT,
        "emailVerified" TIMESTAMP(3),
        "image" TEXT,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "User_pkey" PRIMARY KEY ("id")
      )
    `);
    await neonQuery('CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")');
    log('User table created.');
  }

  log('Step 3: Hash password...');
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('Nyash@0123##', 10);
  log('Hash generated: ' + hash);

  log('Step 4: Insert user bmarambire@gmail.com...');
  const crypto = require('crypto');
  const id = crypto.randomUUID();
  
  const result = await neonQuery(
    `INSERT INTO "User" (id, email, role, name, "passwordHash", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (email) DO UPDATE SET "passwordHash" = $5, role = $3`,
    [id, 'bmarambire@gmail.com', 'ADMIN', 'Brian Marambire', hash]
  );
  log('User inserted: ' + JSON.stringify(result));
  log('DONE! User bmarambire@gmail.com created with role ADMIN');
}

main().catch(e => {
  log('FATAL ERROR: ' + e.message);
  log('Stack: ' + e.stack);
}).finally(() => {
  log('Script finished at ' + new Date().toISOString());
});
