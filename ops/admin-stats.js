#!/usr/bin/env node
// The maker's admin overview: how each kitchen uses Kollegianeren, as numbers per kitchen, written
// to adminStats/latest for the app's Admin page (readable by admins only). No resident names or
// per-resident purchases: counts, the product list and when logins were last active.
//
//   node admin-stats.js --project dev            # write adminStats/latest
//   node admin-stats.js --project prod --dry     # print the summary, write nothing
//
// Counts are aggregation queries (1 read per 1000 documents), so a run is a few hundred reads:
// mostly the product lists and the last 30 days of meals. Runs once a day from cron.
const { init, parseArgs } = require('./lib/firebase');
const { dailyUsage } = require('./lib/quota');
const { Timestamp } = require('firebase-admin/firestore');

const args = parseArgs();
const { projectId, db, auth, accessToken } = init(args.project);
const DAY = 864e5;
let reads = 0;

// A count, at 1 read per 1000 documents. (Sums over a date range would need a composite index.)
async function count(q) {
  const n = (await q.count().get()).data().count;
  reads += Math.max(1, Math.ceil(n / 1000));
  return n;
}

async function get(q) {
  const s = await q.get();
  reads += Math.max(1, s.size);
  return s.docs;
}

const ts = ms => (ms ? Timestamp.fromMillis(ms) : null);

// When a login was created and last used. Needs Firebase Auth read access; null without it.
async function loginInfo(uid, role) {
  try {
    const u = await auth.getUser(uid);
    const last = Math.max(Date.parse(u.metadata.lastRefreshTime || 0) || 0, Date.parse(u.metadata.lastSignInTime || 0) || 0);
    return { role, created: ts(Date.parse(u.metadata.creationTime)), lastActive: ts(last) };
  } catch (e) {
    if (e.code === 'auth/user-not-found') return null;
    return { role, created: null, lastActive: null };
  }
}

// Danish midnight today, whatever the machine's time zone.
function danishMidnight(now = new Date()) {
  const day = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Copenhagen' });
  const offset = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Copenhagen' })) - new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(Date.parse(`${day}T00:00:00Z`) - offset);
}

async function kitchen(k, now) {
  const ref = k.ref;
  const purchases = ref.collection('purchases');
  const since = ms => purchases.where('timestamp', '>=', Timestamp.fromMillis(ms));
  const [today, last7, last30, prev7] = await Promise.all([
    count(since(danishMidnight(new Date(now)).getTime())),
    count(since(now - 7 * DAY)),
    count(since(now - 30 * DAY)),
    count(since(now - 14 * DAY).where('timestamp', '<', Timestamp.fromMillis(now - 7 * DAY))),
  ]);
  const [lastPurchase] = await get(purchases.orderBy('timestamp', 'desc').limit(1));

  const products = await get(ref.collection('products'));
  // The new buy page moves the product's sold counter with every sale; the 2019 build does not.
  // So the last purchase came from the new app if its product changed at the same moment (within a
  // minute, so a later edit of the product, or the one-off sold backfill, does not count).
  let app = null;
  if (lastPurchase) {
    const p = products.find(d => d.id === lastPurchase.get('productId'));
    const lag = p ? p.updateTime.toMillis() - lastPurchase.get('timestamp').toMillis() : null;
    app = lag === null ? null : lag >= -2000 && lag < 60e3 ? 'new' : 'old';
  }

  const users = ref.collection('users');
  const [residents, active, movedOut, anonymised] = await Promise.all([
    count(users), count(users.where('active', '==', true)),
    count(users.where('movedOutAt', '!=', null)), count(users.where('anonymisedAt', '!=', null)),
  ]);

  const meals = await get(ref.collection('meals').where('date', '>=', Timestamp.fromMillis(now - 30 * DAY)));
  const eaten = meals.filter(m => m.get('date').toMillis() < now);
  const cooks = new Set(eaten.flatMap(m => m.get('cooks') || []));
  const booked = meals.map(m => m.get('createdAt')).filter(Boolean).sort((a, b) => b.toMillis() - a.toMillis());

  const messages = ref.collection('messages');
  const [msgCount, [lastMsg]] = await Promise.all([count(messages), get(messages.orderBy('createdAt', 'desc').limit(1))]);

  const members = await get(ref.collection('members'));
  const logins = (await Promise.all([loginInfo(k.id, 'owner'), ...members.map(m => loginInfo(m.id, m.get('role')))])).filter(Boolean);

  const invites = await get(db.collection('invites').where('kitchenId', '==', k.id));
  const links = await count(db.collection('residentLinks').where('kitchenId', '==', k.id));

  return {
    id: k.id, name: k.get('name') || k.id, createdAt: ts(k.createTime?.toMillis()),
    app, logins,
    residents: { total: residents, active, movedOut, anonymised },
    products: products.map(p => ({
      name: p.get('name') || '', price: p.get('price') ?? null, retailPrice: p.get('retailPrice') ?? null,
      stock: p.get('stock') ?? null, sold: p.get('sold') ?? null, active: p.get('active') !== false,
    })).sort((a, b) => Number(b.active) - Number(a.active) || (b.sold ?? 0) - (a.sold ?? 0)),
    purchases: { today, last7, prev7, last30, lastAt: lastPurchase ? lastPurchase.get('timestamp') : null },
    meals: {
      eaten30: eaten.length, eaters30: eaten.reduce((n, m) => n + (m.get('signups') || []).length, 0),
      cooks30: cooks.size, upcoming: meals.length - eaten.length, lastBookedAt: booked[0] ?? null,
    },
    messages: { total: msgCount, lastAt: lastMsg ? lastMsg.get('createdAt') : null, lastFrom: lastMsg ? lastMsg.get('from') : null },
    invites: {
      open: invites.filter(i => !i.get('usedBy') && i.get('expiresAt')?.toMillis() > now).length,
      used: invites.filter(i => i.get('usedBy')).length,
    },
    residentLinks: links,
  };
}

(async () => {
  const now = Date.now();
  const kitchens = await get(db.collection('kitchens'));
  const rows = [];
  for (const k of kitchens) rows.push(await kitchen(k, now));
  rows.sort((a, b) => b.purchases.last30 - a.purchases.last30 || a.name.localeCompare(b.name, 'da'));
  // Reads and writes per quota day. The emulator has no Monitoring.
  const usage = process.env.FIRESTORE_EMULATOR_HOST ? [] : await dailyUsage(accessToken, projectId, 7).catch(() => []);
  const stats = { at: Timestamp.fromMillis(now), usage, kitchens: rows, reads };

  for (const r of rows) {
    console.log(`${r.name.padEnd(18)} ${String(r.purchases.last7).padStart(4)} buys/7d  ${String(r.purchases.last30).padStart(5)} buys/30d  ` +
      `app ${r.app ?? '-'}  ${r.logins.length} logins  ${r.residents.active} residents  ${r.meals.eaten30} meals/30d`);
  }
  console.log(`${rows.length} kitchens, about ${reads} reads`);
  if (args.dry) return;
  await db.doc('adminStats/latest').set(stats);
  console.log(`wrote adminStats/latest on ${projectId}`);
})().catch(e => { console.error(e.message); process.exit(1); });
