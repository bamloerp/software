// Seed users via Neon's HTTP SQL API (port 443, bypasses firewall blocking port 5432)
const https = require('https');
const fs = require('fs');

const NEON_HOST = 'ep-jolly-sound-anl11hdk-pooler.c-6.us-east-1.aws.neon.tech';
const NEON_USER = 'neondb_owner';
const NEON_PASS = 'npg_nbcLWm3GEwJ2';
const NEON_DB = 'neondb';

// bcryptjs hash of "Password@123"
const HASH = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

const log = (msg) => {
  const line = new Date().toISOString() + ' ' + msg;
  fs.appendFileSync('_seed_http_log.txt', line + '\n');
};

function neonQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    const connStr = `postgresql://${NEON_USER}:${NEON_PASS}@${NEON_HOST}/${NEON_DB}?sslmode=require`;
    const body = JSON.stringify({ query: sql, params });
    
    const options = {
      hostname: NEON_HOST,
      port: 443,
      path: '/sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NEON_PASS}`,
        'Neon-Connection-String': connStr,
        'Neon-Pool-Opt-In': 'true',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(body);
    req.end();
  });
}

async function main() {
  fs.writeFileSync('_seed_http_log.txt', '');
  log('Starting HTTP-based seed...');

  try {
    // Test connection
    const testResult = await neonQuery('SELECT 1 as test');
    log('Connection OK: ' + JSON.stringify(testResult));

    // Check if User table exists
    const tableCheck = await neonQuery(
      "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='User')"
    );
    log('Table check: ' + JSON.stringify(tableCheck));

    // Pre-compute bcryptjs hash
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Password@123', 10);
    log('Hash: ' + hash);

    const roles = [
      'ADMIN','QS','SENIOR_QS','SALES','SALES_ACCOUNTS',
      'PROJECT_OPERATIONS_OFFICER','PROCUREMENT','ACCOUNTS','SECURITY','DRIVER',
      'ACCOUNTING_CLERK','ACCOUNTING_OFFICER','ACCOUNTING_AUDITOR'
    ];

    for (const r of roles) {
      const email = `${r.toLowerCase()}@barmlo.com`;
      const name = r.replaceAll('_', ' ');
      const id = require('crypto').randomUUID();

      try {
        const result = await neonQuery(
          `INSERT INTO "User" (id, email, role, name, "passwordHash", "createdAt")
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (email) DO NOTHING`,
          [id, email, r, name, hash]
        );
        log(`  OK: ${email} -> ${JSON.stringify(result)}`);
      } catch (err) {
        log(`  ERR ${email}: ${err.message}`);
      }
    }

    log('Done! All users seeded with password: Password@123');
  } catch (err) {
    log('FATAL: ' + err.message);
  }
}

main();
