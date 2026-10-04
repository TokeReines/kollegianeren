// Regnskab both ways, with the app's own code: from the nightly summary as the app reads it, and
// from every purchase in the period. Compared per kitchen, every resident and product, to the øre.
// Costs a read per purchase in the period, so on prod keep the period short.
// @ts-expect-error: plain JavaScript, signs in as the other ops scripts do.
import {init} from '../../ops/lib/firebase.js';
import {AccountsMonth, Bought, Removed, accounts, fromSummary, monthsOf} from '../../src/app/components/accounting/accounting';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map(s => s.trim().split(/\s+/)));
const day = (s: string) => new Date(`${s}T00:00:00`);
const from = day(args.from), to = day(args.to);
const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
const {db} = init(args.project);

// As JSON with rows and keys in a fixed order, so two computations compare by value.
const sortedKeys = (_: string, v: unknown) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : v;
const fixed = (a: ReturnType<typeof accounts>) => JSON.stringify({...a, rows: [...a.rows].sort((x, y) => x.userId.localeCompare(y.userId))}, sortedKeys);

(async () => {
  let reads = 0, differ = 0;
  for (const kitchen of await db.collection('kitchens').listDocuments()) {
    const months = await Promise.all(monthsOf(from, to > new Date() ? new Date() : to)
      .map(m => kitchen.collection('summaries').doc(`accounts-${m}`).get()));
    reads += months.length;
    const all = await kitchen.collection('purchases').where('timestamp', '>=', from).where('timestamp', '<', end).get();
    reads += Math.max(1, all.size);
    const full = accounts(all.docs.map(d => d.data() as Bought));
    if (!months.every(m => m.exists)) {
      console.log(`${kitchen.id.slice(0, 8)}: no summary, ${all.size} purchases (${full.sums.total} kr.)`);
      continue;
    }
    const docs = months.map(m => m.data() as unknown as AccountsMonth);
    const {through, removedThrough} = docs[0];
    const after = all.docs.filter(d => d.get('timestamp').valueOf() > through.valueOf()).map(d => d.data() as Bought);
    const notes = await kitchen.collection('removed').where('removedAt', '>', removedThrough).get();
    reads += Math.max(1, notes.size);
    const summed = accounts(fromSummary(docs, from, to, after, notes.docs.map(d => d.data() as Removed)));
    const same = fixed(summed) === fixed(full);
    if (!same) {
      differ++;
      // The first resident whose row differs, both ways.
      const mine = new Map(summed.rows.map(r => [r.userId, JSON.stringify(r, sortedKeys)]));
      const row = full.rows.find(r => mine.get(r.userId) !== JSON.stringify(r, sortedKeys));
      console.log(`  every purchase: ${JSON.stringify(row ?? {products: full.products, sums: full.sums}, sortedKeys)}`);
      console.log(`  summary:        ${row ? mine.get(row.userId) : JSON.stringify({products: summed.products, sums: summed.sums}, sortedKeys)}`);
    }
    console.log(`${kitchen.id.slice(0, 8)}: ${same ? 'same' : 'DIFFERENT'}, ${full.sums.purchases} purchases, ${full.sums.total} kr. ` +
      `(summary ${summed.sums.purchases}, ${summed.sums.total} kr.), ${after.length} after the summary, ${notes.size} taken back since`);
  }
  console.log(`${differ ? `${differ} kitchens differ` : 'all the same'}; about ${reads} reads`);
  process.exit(differ ? 1 : 0);
})();
