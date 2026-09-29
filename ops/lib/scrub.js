// Carries the app's anonymising (ResidencyService.anonymise) into the backups: once a resident is
// anonymised in Firestore, their name and room also go from the backed-up purchases and from the
// older snapshots of the residents list. Local files only, so it costs no reads.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Must match ANONYMOUS_NAME in src/app/services/residency.ts.
const ANONYMOUS_NAME = 'Tidligere beboer';

function files(dir, name) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p, name) : name(e.name) ? [p] : [];
  });
}

// Rewrites a gzipped ndjson file in place when `fix` changes a record; returns records changed.
function rewrite(file, fix) {
  const lines = zlib.gunzipSync(fs.readFileSync(file)).toString().split('\n').filter(Boolean);
  let changed = 0;
  const out = lines.map(line => {
    const record = JSON.parse(line);
    if (fix(record)) changed++;
    return JSON.stringify(record);
  });
  if (changed) {
    fs.writeFileSync(file + '.tmp', zlib.gzipSync(out.join('\n') + '\n'));
    fs.renameSync(file + '.tmp', file);
  }
  return changed;
}

// `out` is the backup folder; `anonymised` maps kitchen id to the ids of its anonymised residents.
function scrubAnonymised(out, anonymised) {
  let purchases = 0, residents = 0;
  for (const [kitchenId, ids] of Object.entries(anonymised)) {
    if (!ids.length) continue;
    const gone = new Set(ids);
    for (const file of files(path.join(out, 'purchases', kitchenId), n => n.endsWith('.ndjson.gz'))) {
      purchases += rewrite(file, r => {
        if (!gone.has(r.data.userId) || (r.data.userName === ANONYMOUS_NAME && r.data.userRoom == null)) return false;
        r.data.userName = ANONYMOUS_NAME;
        r.data.userRoom = null;
        return true;
      });
    }
    for (const file of files(path.join(out, 'snapshots'), n => n === 'users.ndjson.gz').filter(f => path.basename(path.dirname(f)) === kitchenId)) {
      residents += rewrite(file, r => {
        const id = r.path.split('/').pop();
        if (!gone.has(id) || (r.data.name === ANONYMOUS_NAME && !r.data.room && !r.data.image && !r.data.clId)) return false;
        Object.assign(r.data, { name: ANONYMOUS_NAME, room: '', image: '', clId: '' });
        return true;
      });
    }
  }
  return { purchases, residents };
}

module.exports = { scrubAnonymised, ANONYMOUS_NAME };
