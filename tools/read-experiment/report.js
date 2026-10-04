#!/usr/bin/env node
// Lines up run.js's events with Google's per-minute read count for dev.
//
//   node report.js [--out /tmp/read-experiment]
const fs = require('fs');
const path = require('path');
const { init } = require('../../ops/lib/firebase');
const { series } = require('../../ops/lib/quota');

const out = (process.argv.join(' ').match(/--out\s+(\S+)/) || [])[1] || '/tmp/read-experiment';
const events = fs.readFileSync(path.join(out, 'events.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const { projectId, accessToken } = init('dev');
const minute = t => Math.floor(t / 60e3) * 60e3;
const hhmm = t => new Date(t).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Copenhagen' }).slice(0, 5);

(async () => {
  const start = minute(events[0].t) - 10 * 60e3;
  const end = Math.min(Date.now(), minute(events[events.length - 1].t) + 5 * 60e3);
  const points = await series(accessToken, projectId, 'document/read_count', new Date(start), new Date(end), 60);
  const reads = new Map(points.map(p => [minute(Date.parse(p.end) - 1), p.value]));
  const rows = [];
  for (let t = start; t < end; t += 60e3) {
    const here = events.filter(e => minute(e.t) === t && e.what !== 'snapshot');
    const snaps = events.filter(e => minute(e.t) === t && e.what === 'snapshot' && !e.fromCache && e.size !== undefined);
    const r = reads.get(t) || 0;
    if (!r && !here.length && !snaps.length) continue;
    rows.push(`${hhmm(t)}  reads ${String(r).padStart(4)}  ${here.map(e => `${e.who}:${e.what}`).join(' ')}` +
      (snaps.length ? `  [server answers: ${snaps.map(e => `${e.who} size ${e.size} changes ${e.changes}`).join('; ')}]` : ''));
  }
  const text = rows.join('\n');
  fs.writeFileSync(path.join(out, 'report.txt'), text + '\n');
  console.log(text);
})();
