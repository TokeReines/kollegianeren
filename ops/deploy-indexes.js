// Creates the composite indexes in firestore.indexes.json that a project lacks, via the Firestore
// Admin API (what `firebase deploy --only firestore:indexes` does; the CLI needs the Service Usage
// API, which is off on prod). Only adds: an index that is not in the file is left alone.
//   node deploy-indexes.js <project> [--dry]
const fs = require('fs'), path = require('path');
const { init } = require('./lib/firebase');
const [project, dry] = process.argv.slice(2);
const { projectId, accessToken } = init(project);
const API = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups`;
const call = async (method, url, body) => {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = await res.json(); if (j.error) throw new Error(`${method} ${url}: ${j.error.message}`); return j;
};
// One line per index: "purchases COLLECTION productId:ASCENDING,timestamp:DESCENDING".
const key = (group, i) => `${group} ${i.queryScope} ` + i.fields.filter(f => f.fieldPath !== '__name__')
  .map(f => `${f.fieldPath}:${f.order ?? f.arrayConfig}`).join(',');
(async () => {
  const wanted = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firestore.indexes.json'), 'utf8')).indexes;
  for (const i of wanted) {
    const existing = (await call('GET', `${API}/${i.collectionGroup}/indexes`)).indexes ?? [];
    const same = existing.find(e => key(i.collectionGroup, e) === key(i.collectionGroup, i));
    if (same) {
      console.log('exists ', key(i.collectionGroup, i), same.state);
      continue;
    }
    if (dry) {
      console.log('missing', key(i.collectionGroup, i), '(dry run, not created)');
      continue;
    }
    await call('POST', `${API}/${i.collectionGroup}/indexes`, { queryScope: i.queryScope, fields: i.fields });
    console.log('created', key(i.collectionGroup, i), '(building; run again to see its state)');
  }
})().catch(e => { console.error(e.message); process.exit(1); });
