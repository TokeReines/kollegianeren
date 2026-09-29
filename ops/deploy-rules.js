// Publishes a Firestore rules file via the Firebase Rules API (what `firebase deploy --only firestore:rules` does).
//   node deploy-rules.js <project> <rules file> [--dry]
const fs = require('fs'), path = require('path');
const { init } = require("./lib/firebase");
const [project, file, dry] = process.argv.slice(2);
const { projectId, accessToken } = init(project);
const API = `https://firebaserules.googleapis.com/v1/projects/${projectId}`;
const call = async (method, url, body) => {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = await res.json(); if (j.error) throw new Error(`${method} ${url}: ${j.error.message}`); return j;
};
(async () => {
  const release = await call('GET', `${API}/releases/cloud.firestore`);
  const current = await call('GET', `https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
  console.log('current release', release.rulesetName, 'updated', release.updateTime);
  console.log('current source:\n' + current.source.files.map(f => f.content).join('\n'));
  const content = fs.readFileSync(file, 'utf8');
  // Server-side compile check.
  const test = await call('POST', `${API}:test`, { source: { files: [{ name: 'firestore.rules', content }] } });
  const issues = (test.issues || []).filter(i => i.severity === 'ERROR');
  if (issues.length) throw new Error('rules do not compile: ' + JSON.stringify(issues));
  if (dry) { console.log('compiles; dry run, not released'); return; }
  const ruleset = await call('POST', `${API}/rulesets`, { source: { files: [{ name: 'firestore.rules', content }] } });
  const updated = await call('PATCH', `${API}/releases/cloud.firestore`, { release: { name: `projects/${projectId}/releases/cloud.firestore`, rulesetName: ruleset.name } });
  console.log('released', updated.rulesetName, 'at', updated.updateTime, '(previous:', release.rulesetName + ')');
})().catch(e => { console.error(e.message); process.exit(1); });
