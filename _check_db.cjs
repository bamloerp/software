const https = require('https');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '_check_db_out.txt');
fs.writeFileSync(OUT, 'STARTED\n');

const h = 'ep-jolly-sound-anl11hdk-pooler.c-6.us-east-1.aws.neon.tech';
const c = 'postgresql://neondb_owner:npg_nbcLWm3GEwJ2@' + h + '/neondb?sslmode=require';

function query(sql) {
  return new Promise((resolve, reject) => {
    const b = JSON.stringify({ query: sql, params: [] });
    const req = https.request({
      hostname: h, port: 443, path: '/sql', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': c, 'Neon-Pool-Opt-In': 'true', 'Content-Length': Buffer.byteLength(b) },
    }, res => {
      let d = '';
      res.on('data', ch => d += ch);
      res.on('end', () => {
        fs.appendFileSync(OUT, 'HTTP ' + res.statusCode + ' for: ' + sql.substring(0, 60) + '\n');
        try { resolve(JSON.parse(d)); } catch(e) { reject(new Error('Parse error: ' + d.substring(0, 200))); }
      });
    });
    req.on('error', (e) => { fs.appendFileSync(OUT, 'REQ ERROR: ' + e.message + '\n'); reject(e); });
    req.write(b);
    req.end();
  });
}

async function main() {
  let out = '';
  const r1 = await query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  out += 'Total tables: ' + r1.rows.length + '\n';
  r1.rows.forEach(r => { out += '  ' + r[0] + '\n'; });

  const r2 = await query('SELECT email, role FROM "User" ORDER BY email');
  out += '\nUsers: ' + r2.rows.length + '\n';
  r2.rows.forEach(r => { out += '  ' + r[0] + ' - ' + r[1] + '\n'; });

  fs.appendFileSync(OUT, out);
  fs.appendFileSync(OUT, '\nDONE\n');
}

main().catch(e => {
  fs.appendFileSync(OUT, 'FATAL: ' + (e.message || String(e)) + '\n' + (e.stack || '') + '\n');
});

process.on('unhandledRejection', (e) => {
  fs.appendFileSync(OUT, 'UNHANDLED: ' + (e.message || String(e)) + '\n');
});
