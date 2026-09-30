// Keeps the backed-up purchases to a rolling window (the backups are for invoicing, which looks
// back a quarter or so): drops older records from the chunk files, deletes chunks that end up
// empty, and returns how many purchases each kitchen has left. Local files only, no reads.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function prunePurchases(out, cutoffMs) {
  const root = path.join(out, 'purchases');
  const kept = {};
  let removed = 0;
  if (!fs.existsSync(root)) return { kept, removed };
  for (const kid of fs.readdirSync(root)) {
    kept[kid] = 0;
    for (const name of fs.readdirSync(path.join(root, kid))) {
      const file = path.join(root, kid, name);
      const lines = zlib.gunzipSync(fs.readFileSync(file)).toString().split('\n').filter(Boolean);
      // Purchases without a (Timestamp) timestamp cannot be dated; they are kept.
      const recent = lines.filter(l => {
        const t = JSON.parse(l).data.timestamp;
        return t?.__t !== 'ts' || t.s * 1000 >= cutoffMs;
      });
      kept[kid] += recent.length;
      if (recent.length === lines.length) continue;
      removed += lines.length - recent.length;
      if (!recent.length) { fs.rmSync(file); continue; }
      fs.writeFileSync(file + '.tmp', zlib.gzipSync(recent.join('\n') + '\n'));
      fs.renameSync(file + '.tmp', file);
    }
  }
  return { kept, removed };
}

module.exports = { prunePurchases };
