#!/usr/bin/env node
// Builds a hosting rollback to an earlier deployed version that also removes the new app's
// service worker. A plain "Roll back" in the console is not enough once tablets run the service
// worker: it keeps serving its cached app, and the 2019 site rewrites ngsw.json to index.html,
// which the worker cannot read. This bundle has the old files plus:
//   - ngsw-worker.js: a safety worker that unregisters, clears the caches and reloads open tabs;
//   - a rewrite that leaves dotted paths alone, so ngsw.json is a 404 (the worker then removes itself).
//
//   node make-rollback.js --project prod --version 7f5f4b4295f2aaad --out ~/kollegianeren-rollback
//   cd ~/kollegianeren-rollback && firebase deploy --only hosting --project prod
//
// The files are downloaded from the live site, so build it BEFORE deploying the new version, and
// keep the folder until the release has settled.
const fs = require('fs');
const path = require('path');
const { init, parseArgs } = require('./lib/firebase');

const args = parseArgs();
const { projectId, accessToken } = init(args.project);
const OUT = path.resolve((args.out || '~/kollegianeren-rollback').replace(/^~/, process.env.HOME));
const API = 'https://firebasehosting.googleapis.com/v1beta1';

const SAFETY_WORKER = `// Rollback: remove the Kollegianeren service worker and load the site from the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  await self.clients.claim();
  for (const name of await caches.keys()) if (/^ngsw:/.test(name)) await caches.delete(name);
  await self.registration.unregister();
  for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
})()));
`;

const FIREBASE_JSON = {
  hosting: {
    public: 'public',
    rewrites: [{ regex: '^/[^.]*$', destination: '/index.html' }],
    headers: [{ source: '**', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }],
  },
};

(async () => {
  const token = await accessToken();
  const get = async url => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j = await res.json(); if (j.error) throw new Error(`${url}: ${j.error.message}`); return j;
  };
  const sites = (await get(`${API}/projects/${projectId}/sites`)).sites;
  const site = args.site || sites[0].name.split('/').pop();
  const live = (await get(`${API}/sites/${site}/channels/live/releases?pageSize=1`)).releases[0].version.name;
  const version = `sites/${site}/versions/${args.version || live.split('/').pop()}`;
  if (live !== version) throw new Error(`${version} is not live (live is ${live}); the files are downloaded from the live site`);

  let files = [], pageToken;
  do {
    const page = await get(`${API}/${version}/files?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`);
    files.push(...(page.files || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  // /__/ is Firebase's own (init.js and friends), served automatically.
  files = files.filter(f => !f.path.startsWith('/__/'));

  fs.rmSync(OUT, { recursive: true, force: true });
  for (const f of files) {
    const res = await fetch(`https://${site}.web.app${f.path}`, { headers: { 'Accept-Encoding': 'identity' } });
    if (!res.ok) throw new Error(`${f.path}: HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    const file = path.join(OUT, 'public', f.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
    console.log(`${f.path}  ${body.length} bytes`);
  }
  fs.writeFileSync(path.join(OUT, 'public', 'ngsw-worker.js'), SAFETY_WORKER);
  fs.writeFileSync(path.join(OUT, 'firebase.json'), JSON.stringify(FIREBASE_JSON, null, 2) + '\n');
  fs.copyFileSync(path.join(__dirname, '..', '.firebaserc'), path.join(OUT, '.firebaserc'));
  console.log(`\n${files.length} files of ${version} + safety worker in ${OUT}`);
  console.log(`deploy: cd ${OUT} && firebase deploy --only hosting --project ${args.project}`);
})().catch(e => { console.error(e.message); process.exit(1); });
