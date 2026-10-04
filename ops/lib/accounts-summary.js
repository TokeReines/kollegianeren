// Regnskab's nightly summary (src/app/components/accounting): one document per kitchen and month,
// kitchens/{kid}/summaries/accounts-YYYY-MM, holding per Danish day, per resident, per product
// name: [units, kroner (unrounded), purchases], with the resident's name and room as on their first purchase
// that day. The app adds up the days of any period and reads only the purchases after `through`.
// Local files only, no reads.

// Firestore keeps timestamps to the microsecond; `through` must too, or the app's "after through"
// query would read the last summarised purchase again.
const before = (a, b) => a.s - b.s || a.n - b.n;

// purchases: [{id, ts: {s, n}, data}] from the backup; removed: ids taken back since (backup.js
// reads the app's notes in removed/). `since` is the first day the backup has complete; `today`
// the current Danish day, so every month up to now gets a document, empty ones too.
function summariseAccounts(purchases, { removed, since, today, local }) {
  const kept = purchases.filter(p => p.ts && !removed.has(p.id)).sort((a, b) => before(a.ts, b.ts) || (a.id < b.id ? -1 : 1));
  // Up to the newest purchase's time, minus that moment: a group purchase shares one timestamp,
  // and a backup that stopped halfway through one would otherwise leave the rest out of both the
  // summary and the app's "after through" query. The app reads that last moment live instead.
  const newest = kept.length ? kept[kept.length - 1].ts : null;
  let through = null;
  for (const p of kept) if (before(p.ts, newest) < 0) through = p.ts;

  const months = {};
  for (let m = since.slice(0, 7); m <= today.slice(0, 7); m = nextMonth(m)) months[m] = {};
  for (const p of kept) {
    if (!through || before(p.ts, through) > 0) break;
    const day = local(p.ts.s * 1000 + Math.floor(p.ts.n / 1e6)).day;
    if (day < since) continue;
    const days = months[day.slice(0, 7)];
    if (!days) continue;
    const d = p.data;
    const users = days[day] || (days[day] = {});
    const u = users[d.userId] || (users[d.userId] = { n: d.userName ?? null, r: d.userRoom == null ? '' : String(d.userRoom), p: {} });
    const row = u.p[d.productName] || (u.p[d.productName] = [0, 0, 0]);
    row[0] += Number(d.amount) || 0;
    row[1] += Number(d.price) || 0;
    row[2]++;
  }
  // Kroner are not rounded here: some prices are not whole øre (a crate's price over its bottles),
  // and Regnskab rounds only the period's sums, so rounding each day could be off by an øre or two.
  return { months, through };
}

function nextMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

// The day after "2026-10-01", as a string.
function nextDay(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

module.exports = { summariseAccounts, nextDay, before };
