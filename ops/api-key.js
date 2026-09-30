#!/usr/bin/env node
// Limits a project's browser API key (the one in src/environments) to our own websites (#63).
// The key's list of allowed Google APIs, set up by Firebase, is kept as it is.
//
//   node api-key.js --project dev                                   # show the browser key
//   node api-key.js --project dev --referrers https://a.web.app/*,http://localhost:4200/*
//   node api-key.js --project dev --referrers any                   # undo: any website again
//
// The calls are billed to the dev project, where the API Keys API is on; prod has it off.
const { init, parseArgs } = require('./lib/firebase');

const args = parseArgs();
const { projectId, accessToken } = init(args.project);
const API = 'https://apikeys.googleapis.com/v2';

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'x-goog-user-project': 'kollegianeren', 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method} ${url}: ${j.error.message}`);
  return j;
}

const show = k => console.log(`${k.displayName}\n  websites: ${k.restrictions?.browserKeyRestrictions?.allowedReferrers?.join(' ') || 'any'}\n  apis: ${k.restrictions?.apiTargets?.length ?? 'any'}`);

(async () => {
  const keys = (await call('GET', `${API}/projects/${projectId}/locations/global/keys`)).keys || [];
  const key = keys.find(k => /^Browser key/.test(k.displayName));
  if (!key) throw new Error('no browser key');
  if (!args.referrers) return show(key);
  const restrictions = { ...key.restrictions };
  if (args.referrers === 'any') delete restrictions.browserKeyRestrictions;
  else restrictions.browserKeyRestrictions = { allowedReferrers: args.referrers.split(',').map(s => s.trim()).filter(Boolean) };
  console.log('before:'); show(key);
  let op = await call('PATCH', `${API}/${key.name}?updateMask=restrictions`, { restrictions });
  while (!op.done) { await new Promise(r => setTimeout(r, 1500)); op = await call('GET', `${API}/${op.name}`); }
  if (op.error) throw new Error(op.error.message);
  console.log('after:'); show(op.response);
  console.log('Google takes a few minutes to apply it.');
})().catch(e => { console.error(e.message); process.exit(1); });
