#!/usr/bin/env node
// Regnskab from the nightly summary against Regnskab from every purchase (check.ts), per kitchen.
// Bundles check.ts with the app's accounting code and runs it in Danish time, as the app does.
//
//   node tools/accounts-check/run.js --project dev --from 2026-09-01 --to 2026-10-04
//
// A read per purchase in the period: on prod a month is about 5,000.
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const out = path.join(require('os').tmpdir(), 'accounts-check.js');
execFileSync(`${ROOT}/node_modules/.bin/esbuild`, [path.join(__dirname, 'check.ts'), '--bundle', '--platform=node',
  '--external:firebase-admin', `--outfile=${out}`, '--log-level=warning'], { cwd: ROOT, stdio: 'inherit' });
try {
  execFileSync(process.execPath, [out, ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, TZ: 'Europe/Copenhagen', NODE_PATH: path.join(ROOT, 'ops/node_modules') },
  });
} catch (e) {
  process.exit(e.status || 1);
}
