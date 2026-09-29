#!/usr/bin/env node
// Seeds the running local emulators (auth 9099, firestore 8181) with things prod data does not
// have: an admin ("maker") login, and the launch announcement draft. Emulator only.
//
//   node seed-emulator.js
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8181';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const ACCOUNTS = path.join(os.homedir(), 'kollegianeren-emulator-data/accounts.json');
const MAKER = { uid: 'maker', email: 'toke@maker.test' };

const LAUNCH = {
  title: 'Kollegianeren har fået en stor opdatering',
  body: `Hej alle sammen!

Kollegianeren er bygget om indvendigt, men ser næsten ud som før. Det her er nyt:

• Sikkerhed: jeres køkkens varer, beboere og køb kan nu kun ses af jeres eget køkken.
• Hurtigere: appen er under halvt så stor og starter hurtigere på tablets.
• Glemt kode: I kan selv nulstille koden fra login-siden.
• Dansk og engelsk: tryk på EN eller DA i hjørnet.
• Fortryd: tryk "Fortryd" lige efter et køb, hvis I ramte forkert.
• Virker uden net: tabletten husker købene og sender dem, når forbindelsen er tilbage.
• Statistik, lager og avance: se hvad der bliver drukket, og hvornår varerne slipper op.
• Flere logins: et tablet-login, der kun kan købe, og et til kassereren. Nye køkkener kommer ind med en invitation.
• Aktuelt: nyheder her, og en direkte linje til mig lige ved siden af.

Skål!
Toke`,
};

(async () => {
  const app = initializeApp({ projectId: 'demo-kollegianeren' });
  const accounts = JSON.parse(fs.readFileSync(ACCOUNTS, 'utf8'));
  try {
    await getAuth(app).createUser({ ...MAKER, password: accounts.password });
  } catch (e) {
    if (!/already/.test(e.message)) throw e;
  }
  const db = getFirestore(app);
  await db.doc(`admins/${MAKER.uid}`).set({ email: MAKER.email });
  const existing = await db.collection('announcements').where('title', '==', LAUNCH.title).get();
  if (existing.empty) await db.collection('announcements').add({ ...LAUNCH, createdAt: FieldValue.serverTimestamp() });
  else await existing.docs[0].ref.update({ body: LAUNCH.body });
  accounts.maker = MAKER.email;
  fs.writeFileSync(ACCOUNTS, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  console.log(`maker login ${MAKER.email} (same password as the kitchens), launch announcement ${existing.empty ? 'added' : 'updated'}`);
})().catch(e => { console.error(e.message); process.exit(1); });
