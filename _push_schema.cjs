// Push schema DDL to Neon via HTTP SQL API (bypasses port 5432 requirement)
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '_push_schema_log.txt');
fs.writeFileSync(OUT, '');
const log = (msg) => fs.appendFileSync(OUT, new Date().toISOString() + ' ' + msg + '\n');

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
      timeout: 60000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
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
  log('=== Starting schema push ===');
  
  // Read DDL
  const ddl = fs.readFileSync(path.join(__dirname, '_schema_ddl.sql'), 'utf8');
  
  // Split into individual statements by semicolons, filtering comments and empty
  const raw = ddl.split(';');
  const statements = [];
  for (const s of raw) {
    const trimmed = s.replace(/--[^\n]*/g, '').trim();
    if (trimmed && trimmed.length > 3) {
      statements.push(trimmed + ';');
    }
  }
  
  log('Total statements: ' + statements.length);

  let ok = 0, skipped = 0, failed = 0;
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.substring(0, 120).replace(/\n/g, ' ');
    
    try {
      const result = await neonQuery(stmt);
      ok++;
      log('[' + (i+1) + '/' + statements.length + '] OK: ' + preview);
    } catch (err) {
      const msg = err.message || '';
      // "already exists" errors are expected for existing tables/types/indexes
      if (msg.includes('already exists') || msg.includes('duplicate key')) {
        skipped++;
        log('[' + (i+1) + '/' + statements.length + '] SKIP (exists): ' + preview);
      } else {
        failed++;
        log('[' + (i+1) + '/' + statements.length + '] FAIL: ' + preview);
        log('  Error: ' + msg.substring(0, 300));
      }
    }
  }
  
  log('');
  log('=== DONE ===');
  log('OK: ' + ok + ', Skipped: ' + skipped + ', Failed: ' + failed);
  log('Total: ' + (ok + skipped + failed) + ' / ' + statements.length);
}

main().catch(e => {
  log('FATAL: ' + e.message);
  log(e.stack);
});
