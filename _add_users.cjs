// Bulk add users: HUMAN_RESOURCE, CLIENT, MANAGING_DIRECTOR, SENIOR_PROCUREMENT
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

const USERS = [
  { email: 'human_resource@barmlo.com', role: 'HUMAN_RESOURCE', name: 'Human Resource' },
  { email: 'client@barmlo.com', role: 'CLIENT', name: 'Client' },
  { email: 'managing_director@barmlo.com', role: 'MANAGING_DIRECTOR', name: 'Managing Director' },
  { email: 'senior_procurement@barmlo.com', role: 'SENIOR_PROCUREMENT', name: 'Senior Procurement' },
];

(async () => {
  try {
    const hash = await bcrypt.hash('Password@123', 10);
    for (const u of USERS) {
      const id = crypto.randomUUID();
      const r = await q(
        `INSERT INTO "User" (id, email, role, name, "passwordHash", "createdAt")
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (email) DO UPDATE SET role=EXCLUDED.role, name=EXCLUDED.name
         RETURNING email, role, name`,
        [id, u.email, u.role, u.name, hash]
      );
      console.log('UPSERTED:', JSON.stringify(r.rows[0]));
    }
  } catch (e) { console.error('ERR:', e.message); process.exit(1); }
})();
