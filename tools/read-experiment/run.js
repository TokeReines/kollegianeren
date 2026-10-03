#!/usr/bin/env node
// When does Firestore bill a listener's whole result again? Several browsers, each listening to a
// different number of dev's kitchens, follow different patterns (awake, sleeping 35 or 10 minutes,
// a flaky network, reloads, a long offline spell). Every event and snapshot is logged with its
// time; afterwards Google's per-minute read count for dev is fetched and lined up with them, so a
// spike's size tells which browser and which event cost it.
//
//   node run.js [--minutes 120] [--out /tmp/read-experiment]
//
// Needs playwright-core (NODE_PATH) and a Chromium from `npx playwright install chromium`.
// Reads only dev's kitchens collection, which is public; signs nobody in.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright-core');

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map(s => s.trim().split(/\s+/)));
const MINUTES = +(args.minutes || 120);
const OUT = args.out || '/tmp/read-experiment';
const MIN = 60e3;
fs.mkdirSync(OUT, { recursive: true });
const events = fs.createWriteStream(path.join(OUT, 'events.jsonl'), { flags: 'a' });
const T0 = Date.now();
const log = (who, what, extra = {}) => {
  const e = { t: Date.now(), m: +((Date.now() - T0) / MIN).toFixed(2), who, what, ...extra };
  events.write(JSON.stringify(e) + '\n');
  console.log(new Date(e.t).toISOString().slice(11, 19), who.padEnd(8), what, JSON.stringify(extra));
};

// The page, bundled with the project's own Firebase, served from localhost (a secure context, so
// the offline cache works).
const ROOT = path.resolve(__dirname, '../..');
execSync(`${ROOT}/node_modules/.bin/esbuild ${__dirname}/page.js --bundle --format=esm --outfile=${OUT}/page.bundle.js --log-level=warning`, { cwd: ROOT });
fs.writeFileSync(`${OUT}/index.html`, '<!doctype html><meta charset="utf-8"><title>reads</title><script type="module" src="page.bundle.js"></script>');
const server = http.createServer((req, res) => {
  const file = req.url.startsWith('/page.bundle.js') ? 'page.bundle.js' : 'index.html';
  res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
  fs.createReadStream(`${OUT}/${file}`).pipe(res);
}).listen(8765);

// Who does what, in minutes from the start. Sizes differ so a full re-read shows by its size.
const SCENARIOS = [
  { who: 'awake', n: 25, plan: [] },
  { who: 'sleep35', n: 21, plan: [[5, 'sleep'], [40, 'wake'], [45, 'sleep'], [80, 'wake'], [85, 'sleep'], [118, 'wake']] },
  { who: 'sleep10', n: 13, plan: Array.from({ length: 9 }, (_, i) => [[6 + i * 12, 'sleep'], [16 + i * 12, 'wake']]).flat() },
  { who: 'flaky', n: 8, plan: Array.from({ length: 14 }, (_, i) => [[3 + i * 8, 'offline'], [4 + i * 8, 'online']]).flat() },
  { who: 'reload', n: 5, plan: Array.from({ length: 12 }, (_, i) => [9 + i * 9, 'reload']) },
  { who: 'offline35', n: 3, plan: [[10, 'offline'], [45, 'online'], [50, 'offline'], [62, 'online']] },
];

(async () => {
  const exe = fs.readdirSync(`${process.env.HOME}/.cache/ms-playwright`).filter(d => d.startsWith('chromium-')).sort().pop();
  const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/${exe}/chrome-linux64/chrome` });
  const runs = [];
  for (const s of SCENARIOS) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', msg => {
      const text = msg.text();
      if (text.startsWith('EXP ')) log(s.who, 'snapshot', JSON.parse(text.slice(4)));
    });
    const cdp = await context.newCDPSession(page);
    await page.goto(`http://localhost:8765/?n=${s.n}`);
    log(s.who, 'open', { n: s.n });
    runs.push({ ...s, context, page, cdp });
    await new Promise(r => setTimeout(r, 20e3));
  }

  const act = {
    // Screen off: the page is hidden and frozen (timers stop) and the network goes, as on a tablet.
    async sleep(r) {
      await r.context.setOffline(true);
      await r.cdp.send('Page.setWebLifecycleState', { state: 'frozen' }).catch(e => log(r.who, 'freeze-failed', { e: e.message }));
    },
    async wake(r) {
      await r.cdp.send('Page.setWebLifecycleState', { state: 'active' }).catch(e => log(r.who, 'unfreeze-failed', { e: e.message }));
      await r.context.setOffline(false);
    },
    offline: r => r.context.setOffline(true),
    online: r => r.context.setOffline(false),
    reload: r => r.page.reload(),
  };
  const due = SCENARIOS.flatMap(s => s.plan.map(([m, what]) => ({ m, what, who: s.who }))).sort((a, b) => a.m - b.m);
  for (const d of due) {
    if (d.m >= MINUTES) break;
    const wait = T0 + d.m * MIN - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    const r = runs.find(x => x.who === d.who);
    log(d.who, d.what);
    await act[d.what](r);
  }
  const rest = T0 + MINUTES * MIN - Date.now();
  if (rest > 0) await new Promise(r => setTimeout(r, rest));
  log('all', 'done');
  await browser.close();
  server.close();
  events.end();
})().catch(e => { log('all', 'crashed', { e: e.message }); process.exit(1); });
