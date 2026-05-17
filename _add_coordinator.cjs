// Insert project_coordinator@barmlo.com with role PROJECT_COORDINATOR
const https = require('https');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const NEON_HOST = 'ep-jolly-sound-anl11hdk-pooler.c-6.us-east-1.aws.neon.tech';
const NEON_USER = 'neondb_owner';
const NEON_PASS = 'npg_nbcLWm3GEwJ2';
const NEON_DB = 'neondb';

function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    const connStr = `postgresql://${NEON_USER}:${NEON_PASS}@${NEON_HOST}/${NEON_DB}?sslmode=require`;
    const body = JSON.stringify({ query: sql, params });
    const req = https.request({
      hostname: NEON_HOST, port: 443, path: '/sql', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': connStr,
        'Neon-Pool-Opt-In': 'true',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => res.statusCode < 300 ? resolve(JSON.parse(data)) : reject(new Error(`HTTP ${res.statusCode}: ${data}`)));
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

(async () => {
  try {
    const email = 'project_coordinator@barmlo.com';
    const role = 'PROJECT_COORDINATOR';
    const name = 'Project Coordinator';
    const hash = await bcrypt.hash('Password@123', 10);
    const id = crypto.randomUUID();

    const ins = await q(
      `INSERT INTO "User" (id, email, role, name, "passwordHash", "createdAt")
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (email) DO UPDATE SET role=EXCLUDED.role, name=EXCLUDED.name
       RETURNING email, role, name`,
      [id, email, role, name, hash]
    );
    console.log('UPSERTED:', JSON.stringify(ins.rows));
  } catch (e) { console.error('ERR:', e.message); process.exit(1); }
})();
