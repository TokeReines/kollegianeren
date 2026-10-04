// Kollegiet's archive (issue #169): one document a month, archive/{YYYY-MM}, made from the backup's
// Kollegiet files (backup.js keeps them in kollegiet/), so looking back costs a read per month
// instead of every battle, vote, high-five and note of it. Local files only, no reads.
//
// A month holds what happened in it: battles won (two kitchens or more) and votes won, with the
// numbers; high-fives and badges each kitchen got; and the notes that were talked about most.

const NOTES = 5;
const NOTE_TEXT = 200;
const SYSTEM = 'kollegiet';

// A backed-up timestamp ({__t: 'ts', s, n}) as milliseconds, 0 when there is none.
const ms = t => t && t.__t === 'ts' ? t.s * 1000 + Math.floor((t.n || 0) / 1e6) : 0;

// store: {battles, polls, kudos, posts}, each a list of documents as backed up (data only);
// month(ms) gives "2026-10" in Danish time.
function archive(store, month) {
  const months = {};
  const of = at => months[month(at)] ||= { battles: [], polls: [], kudos: {}, notes: [] };

  for (const b of store.battles || []) {
    const winners = b.result?.winners || [];
    const at = ms(b.to);
    if (!at || !winners.length || (b.participants || []).length < 2) continue;
    of(at).battles.push({ title: b.title || '', metric: b.metric || '', winners, scores: b.result.scores || {}, at });
  }
  for (const p of store.polls || []) {
    const winners = p.result?.winners || [];
    const at = ms(p.closesAt);
    if (!at || p.cancelled || !winners.length) continue;
    of(at).polls.push({ title: p.title || '', kitchenId: p.kitchenId || '', winners, votes: p.result.votes || {}, at });
  }
  for (const k of store.kudos || []) {
    const at = ms(k.createdAt);
    if (!at || !k.to) continue;
    const got = of(at).kudos[k.to] ||= { highfives: 0, badges: {} };
    if (k.kind === 'badge' && k.badge) got.badges[k.badge] = (got.badges[k.badge] || 0) + 1;
    else got.highfives++;
  }
  const replies = new Map();
  for (const p of store.posts || []) if (p.parentId) replies.set(p.parentId, (replies.get(p.parentId) || 0) + 1);
  for (const p of store.posts || []) {
    const at = ms(p.createdAt);
    if (!at || p.parentId || p.kitchenId === SYSTEM || !replies.get(p.id)) continue;
    of(at).notes.push({ kitchenId: p.kitchenId, text: String(p.text || '').slice(0, NOTE_TEXT), replies: replies.get(p.id), at });
  }

  for (const m of Object.values(months)) {
    m.battles.sort((a, b) => b.at - a.at);
    m.polls.sort((a, b) => b.at - a.at);
    m.notes = m.notes.sort((a, b) => b.replies - a.replies || b.at - a.at).slice(0, NOTES);
  }
  return months;
}

module.exports = { archive };
