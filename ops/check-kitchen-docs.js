// Read-only. Before releasing the rule "owner by uid only if kitchens/{uid} exists": lists kitchen ids
// that have data (subcollections) but no kitchens/{id} document. Their owner would lose access.
//   node check-kitchen-docs.js <prod|dev>
const { init } = require('./lib/firebase');
const { db } = init(process.argv[2]);
(async () => {
  const refs = await db.collection('kitchens').listDocuments();
  const snaps = refs.length ? await db.getAll(...refs) : [];
  const missing = snaps.filter(s => !s.exists).map(s => s.id);
  console.log(`kitchen ids: ${refs.length} | without a kitchens/{id} document: ${missing.length}`);
  for (const id of missing) {
    const cols = (await db.collection('kitchens').doc(id).listCollections()).map(c => c.id);
    console.log(`  ${id}: ${cols.join(', ')}`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
