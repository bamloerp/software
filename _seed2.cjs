const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.join(__dirname, '_seed2_log.txt');
fs.writeFileSync(OUT, '');
const log = (msg) => { const line = new Date().toISOString() + ' ' + msg; fs.appendFileSync(OUT, line + '\n'); };

const NEON_HOST = 'ep-jolly-sound-anl11hdk-pooler.c-6.us-east-1.aws.neon.tech';
const CONN_STR = 'postgresql://neondb_owner:npg_nbcLWm3GEwJ2@' + NEON_HOST + '/neondb?sslmode=require';

function neonQuery(sql, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql, params: params || [] });
    log('QUERY: ' + sql.substring(0, 200));
    const req = https.request({
      hostname: NEON_HOST, port: 443, path: '/sql', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': CONN_STR,
        'Neon-Pool-Opt-In': 'true',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 60000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        log('RESPONSE ' + res.statusCode + ': ' + data.substring(0, 300));
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
        } else {
          reject(new Error('HTTP ' + res.statusCode + ': ' + data));
        }
      });
    });
    req.on('error', (e) => { log('ERROR: ' + e.message); reject(e); });
    req.on('timeout', () => { log('TIMEOUT on query'); req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function main() {
  log('=== Starting seed ===');

  // Step 1: Create User table (IF NOT EXISTS)
  log('Creating User table...');
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
  log('User table ready.');

  // Step 2: Create unique index
  log('Creating unique index...');
  await neonQuery('CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")');
  log('Index ready.');

  // Step 3: Hash password
  log('Hashing password...');
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('Nyash@0123##', 10);
  log('Hash: ' + hash);

  // Step 4: Insert user
  log('Inserting user bmarambire@gmail.com...');
  const id = crypto.randomUUID();
  await neonQuery(
    `INSERT INTO "User" (id, email, role, name, "passwordHash", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", role = EXCLUDED.role`,
    [id, 'bmarambire@gmail.com', 'ADMIN', 'Brian Marambire', hash]
  );
  log('SUCCESS: User bmarambire@gmail.com created with ADMIN role.');
  log('Password: Nyash@0123##');
  log('=== DONE ===');
}

main().catch(e => {
  log('FATAL: ' + e.message);
  log(e.stack);
});
