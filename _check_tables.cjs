const https = require('https');
const fs = require('fs');

const NEON_HOST = 'ep-jolly-sound-anl11hdk-pooler.c-6.us-east-1.aws.neon.tech';
const CONN_STR = 'postgresql://neondb_owner:npg_nbcLWm3GEwJ2@' + NEON_HOST + '/neondb?sslmode=require';

function neonQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql, params: [] });
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
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error('HTTP ' + res.statusCode + ': ' + data));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function main() {
  const r = await neonQuery("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  fs.writeFileSync('_tables_result.txt', JSON.stringify(r, null, 2));
  process.stdout.write('Tables: ' + r.rows.map(x => x.tablename).join(', ') + '\n');
}

main().catch(e => {
  fs.writeFileSync('_tables_result.txt', 'ERROR: ' + e.message);
  process.stderr.write('ERROR: ' + e.message + '\n');
  process.exit(1);
});
