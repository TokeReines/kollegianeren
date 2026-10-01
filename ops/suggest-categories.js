#!/usr/bin/env node
// Proposes a category for every product without one, from its name, for battles like "most
// beers" (docs/kollegiet.md). Prints the proposals; --write sets them. Managers can always
// change a product's category in the products dialog.
//
//   node suggest-categories.js --project dev              # print
//   node suggest-categories.js --project dev --write      # set them
//   node suggest-categories.js --emulator --write
//
// Writing to prod needs --i-really-mean-prod as well. Reads: every product once.
const { parseArgs } = require('./lib/firebase');

// First match wins: water and soft drinks before beer, so "Hancock danskvand" is water.
const RULES = [
  ['other', /\bpant\b/i],
  ['water', /danskvand|dansevand|\bvand\b|egekilde|apollinaris|asgervand|kildevand/i],
  ['soda', /cola|pepsi|faxe|kondi|squash|sodavand|soda|mate|monster|red ?bull|cocio|tonic|ginger|\bfrem\b|capri|ice ?tea|jarritos|orangina|miranda|lemonade|limonade|æblemost|juice|sport|energi|lolly|krating/i],
  ['cider', /cider|somersby/i],
  ['spirits', /shot|vodka|\bgin\b|\brom\b|jäger|jager|smirnoff|breezer|whisky|snaps/i],
  ['wine', /\bvin\b|rosé|rose|prosecco|cava|champagne/i],
  ['snack', /chips|slik|snack|nødder|\bis\b/i],
  ['beer', /øl|\bol\b|tuborg|carlsberg|pils|ipa|\bale\b|lager|bajer|porter|stout|wiibroe|wiiibroe|classic|grøn|guld|julebryg|weiss|paulaner|blanc|maribo|albani|odense|nordlyst|harboe|hancock|limfjord|brooklyn|bryg|nørrebro|fad|nordic|alkofri/i],
];

function suggest(name) {
  const hit = RULES.find(([, re]) => re.test(String(name || '')));
  return hit ? hit[0] : null;
}

module.exports = { suggest };

if (require.main === module) {
  const args = parseArgs();
  (async () => {
    let db;
    if (args.emulator) {
      process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8181';
      db = require('firebase-admin/firestore').getFirestore(require('firebase-admin/app').initializeApp({ projectId: 'demo-kollegianeren' }));
    } else {
      const init = require('./lib/firebase').init(args.project);
      if (args.write && init.projectId === 'firebase-ehp' && !args['i-really-mean-prod']) throw new Error('Writing to prod needs --i-really-mean-prod');
      db = init.db;
    }
    let reads = 0, writes = 0;
    for (const k of (await db.collection('kitchens').get()).docs) {
      const products = (await k.ref.collection('products').get()).docs;
      reads += products.length + 1;
      const todo = products.filter(p => !p.get('category'));
      if (!todo.length) continue;
      console.log(`\n${k.get('name')}`);
      for (const p of todo) {
        const c = suggest(p.get('name'));
        console.log(`  ${String(c || '-').padEnd(8)} ${p.get('name')}`);
        if (args.write && c) {
          await p.ref.update({ category: c });
          writes++;
        }
      }
    }
    console.log(`\n${reads} reads, ${writes} writes${args.write ? '' : ' (dry run: --write to set them)'}`);
  })().catch(e => { console.error(e.message); process.exit(1); });
}
