// One-shot: update existing user's role from SALESACCOUNT -> SALES_ACCOUNTS
const https = require('https');
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
    const before = await q(`SELECT email, role, name FROM "User" WHERE role IN ('SALESACCOUNT','SALES_ACCOUNTS')`);
    console.log('BEFORE:', JSON.stringify(before.rows));
    const upd = await q(`UPDATE "User" SET role='SALES_ACCOUNTS', name='Sales Accounts' WHERE role='SALESACCOUNT' RETURNING email, role, name`);
    console.log('UPDATED:', JSON.stringify(upd.rows));
    const after = await q(`SELECT email, role, name FROM "User" WHERE role='SALES_ACCOUNTS'`);
    console.log('AFTER:', JSON.stringify(after.rows));
  } catch (e) { console.error('ERR:', e.message); process.exit(1); }
})();
