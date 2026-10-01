# Kollegiet: play between the kitchens

Design for a shared space where kitchens talk to each other, invite each other, compete and
give each other recognition. Nothing here is built yet. It is split into phases that each ship on
their own (dev first, then prod), tracked in the issues listed under Phases.

## Goals

- **Contact:** kitchens write to each other, invite each other to parties and broadcast events to
  everyone ("Åbent køkken fredag kl. 21").
- **Battles, live:** a kitchen challenges one kitchen or all of them. Examples: "most food club
  diners in October", "most beers this Friday", "most gym visits this week". Counters go up while
  it happens, like the bar nights at Egmont: "Ny2 just bought 20 beers in 20 minutes" is the
  point.
- **Recognition:** high-fives, badges given by other kitchens ("Gode venner", "Bedste fest"),
  achievements the app hands out, and monthly votes ("Bedst til genbrug", "Mest plantebaseret").

## Constraints

- **Zero cost.** Spark plan, so no Cloud Functions. Live counters are written by the kitchens'
  own tablets, in the same batch as the sale (like the `sold` counter). What has to be checked or
  settled across kitchens (final results, trophies, vote tallies, milestones) runs on tokeserver,
  next to the job that writes `adminStats/latest` (`ops/admin-stats.js`).
- **Reads.** The quota is 50k reads a day and prod uses about 4k now. Every open tablet pays one
  read per change to a document it listens to. So each listener is limited (newest 50, last 30
  days), a battle's live score is one small document per kitchen, and only tablets of kitchens in
  a live battle listen to it. Budget per phase in Cost below.
- **Always kitchen against kitchen, never residents.** Everything is shown per kitchen: no
  resident names, no per-resident scores, no signatures on posts. Purchases and sign-ups never
  leave their kitchen; only kitchen totals do.
- **Everyone in a kitchen takes part, the tablet included.** The tablet is where the kitchen is.
  This makes moderation necessary (below).
- **Old tablets.** Kitchens still on the 2019 build see none of this until they reload. The admin
  overview shows which ones (`app: 'old'`).

## Who may do what

The rules get one new helper: a kitchen login. That is any signed-in, non-anonymous user who
belongs to a kitchen. Resident links sign in anonymously and must not see Kollegiet.

```
function kitchenLogin() {
  return signedIn() && request.auth.token.firebase.sign_in_provider != 'anonymous'
    && isMember(myKitchen());
}
```

| | Tablet | Treasurer | Owner | Maker (admin) |
|---|---|---|---|---|
| Read Kollegiet | yes | yes | yes | yes |
| Post, reply, RSVP, high-five, badge, vote, join a battle, tap the gym counter | yes | yes | yes | yes |
| Start a battle, create an event, start a poll | yes | yes | yes | yes |
| Hide a post by their own kitchen | no | yes | yes | yes |
| Hide anything (moderation only, the maker does not play) | no | no | no | yes |
| Edit the kitchen profile | no | yes | yes | yes |

Every document a kitchen writes carries `kitchenId`, and the rules require
`kitchenId == myKitchen()`. So a kitchen can never write as another kitchen.

## Data model

New top-level collections, outside `kitchens/{kid}`:

- the kitchen document is public to the internet (`allow read: if true`);
- the catch-all rule under `kitchens/{kid}` lets managers write any new subcollection.

Every new collection is read with `kitchenLogin()`.

| Collection | Document | Written by | Notes |
|---|---|---|---|
| `profiles/{kid}` | `emoji`, `colour` (one of a fixed palette), `bio` (≤ 200), `updatedAt` | managers of `kid` | What other kitchens see next to the name. |
| `posts/{id}` | `kitchenId`, `text` (≤ 1000), `to` (null = everyone, or a kitchen id), `parentId` (null or the post replied to), `createdAt`, `hidden` | any member; `hidden` only by managers of the author kitchen or the maker | The board. Replies are posts with `parentId`, so one listener (newest 50) shows a thread. Deleting your own post is allowed for 5 minutes, like undoing a sale. |
| `events/{id}` | `kitchenId`, `kind` (`openKitchen`, `party`, `dinner`, `other`), `title`, `text`, `place`, `startsAt`, `endsAt`, `invited` (`all` or a list of kitchen ids), `rsvp` (map kitchen id → `yes`, `maybe`, `no`), `createdAt`, `hidden` | the author kitchen; other kitchens change only their own `rsvp` key | Shown on the board and on the strip under the top bar when it is for you. |
| `battles/{id}` | `kitchenId` (challenger), `title`, `metric`, `from`, `to`, `invited` (`all` or kitchen ids), `participants` (kitchen ids that joined), `createdAt`, `result` (written by the job) | the challenger creates; another kitchen may only add itself to `participants`, before `to` | See Battles. `participants` is an array so a tablet finds its live battles with one `array-contains` listener. |
| `battles/{id}/tally/{kid}` | `value`, `ticks` (the last 30 increments as `{at, n}`), `updatedAt` | members of `kid`, while the battle is live | The live score. One document per kitchen, so a sale costs each watcher one read. `ticks` is what "20 beers in 20 minutes" is worked out from. |
| `kudos/{id}` | `from`, `to`, `kind` (`highfive` or `badge`), `badge` (from a fixed list), `reason` (≤ 140), `createdAt`, `hidden` | any member of `from`, `to != from` | A high-five's id is `{from}_{to}_{day}`, so one per kitchen pair per day. |
| `polls/{kid}_{month}` | `kitchenId` (who started it), `title` (≤ 80), `opensAt`, `closesAt`, `result` (written by the job), `hidden` | any member of `kid` | Kitchens start their own polls ("Bedst til genbrug, oktober"). The id gives one poll per kitchen per month; it runs 1 to 31 days. |
| `votes/{poll}_{kid}` | `poll`, `from`, `choice`, `createdAt` | any member of `from`, not for itself, before `closesAt` | The document id gives one vote per kitchen, changeable until it closes. Secret: a kitchen may read only its own vote, nobody else's, the maker included. Only the job (admin SDK) reads them all, and writes the result. |
| `standings/{kid}` | `achievements`, `badges` (counts), `highfives`, `wins`, `kudosThrough`, `updatedAt` | ops job only | The kitchen's trophy shelf on its profile and its pins in the top bar. Kudos up to `kudosThrough` are in the counts; the app adds newer ones from the kudos it already has. |
| `standings/{kid}/achievements/{code}` | `battle`, `at` | members of `kid`, only if the rules' check of the tally passes; or the job | Live achievements (see Battles). |
| `seen/{kid}` | `kollegietAt`, `aktueltAt`, `lastPostAt` | a kitchen login of `kid` | When the kitchen last opened Kollegiet and Aktuelt, for the badge and the strip; its last post, for the rate limit. |
| `reports/{id}` | `kitchenId` (`kollegiet`), `target` (path), `text`, `createdAt` | ops/league.js only | Technical notes (a tally that was off, an achievement taken back), in the maker's inbox. |

Rate limits without functions:

- High-fives are limited by their document ids.
- A tally may move by at most 400 per write, and the gym counter by 1, at most once every
  5 seconds (`request.time > updatedAt + 5s`).
- Posts carry the time, and the rules check `createdAt == request.time`.
- A kitchen's `seen` doc gets a `lastPostAt` that the post must update in the same batch. The rule
  requires `request.time > lastPostAt + 30s`, with `getAfter` as in the invite flow. That gives
  one post per 30 seconds per kitchen.

## Notifications

PR #143 adds a strip under the top bar and a bell for an unread message from the maker. It
becomes a small notification centre with one source list, shown in this order:

1. a message from the maker (#143);
2. a post on Aktuelt, each its own item: newer than `seen/{kid}.aktueltAt` and at most 14 days old;
3. an invitation or challenge to your kitchen (an event or battle with you in `invited`);
4. a badge or high-five your kitchen received;
5. an event for everyone, starting within 3 days;
6. new posts on the board: only a badge on the Kollegiet menu item, not the strip.

The strip shows the top item and opens it; the bell opens a list of all of them, each one
clickable. Unseen means newer than `seen/{kid}.kollegietAt`, worked out from listeners Kollegiet
keeps anyway, so no extra queries. Opening Kollegiet updates `kollegietAt`, opening Aktuelt
`aktueltAt` (one more small listener: the newest 10 posts on Aktuelt). A tablet would otherwise
show the strip all evening, so it may also be dismissed. Dismissing it updates the same field.

## Screens

- **Kollegiet** (new menu item, everyone). Three tabs:
  - **Opslagstavle:** a pin board. Across the top, loud: stickers in one row that scrolls,
    newest on the left: the newest 20 high-fives and badges, and battles and votes won in the
    last three days (gold). A button gives a high-five or a badge to any kitchen. Under it one
    wall of papers of the same size, in a fixed order, so space follows how many there are of
    each:
    1. a blank note to write on, with buttons for an event and a vote;
    2. events as flyers, soonest first, with yes/maybe/no on them; four, then "+N more";
    3. open votes as ballots;
    4. posts as post-its in the writing kitchen's colour, newest activity first, with "Ny"
       when there is something since the kitchen last looked. A conversation takes more room
       than a single post: with replies a post-it is two papers tall and shows the newest two;
       with 5 replies or 4 kitchens in it, it is two wide as well and shows four. At the bottom,
       the faces of the kitchens in it and "💬 12 svar". A post-it opens with the whole post,
       its replies and a reply field. Nothing is tilted (rotated text blurs).
    Phones: two papers a row.
  - **Battles:** live battles with their scoreboard and a button to join. Below that, past
    battles, then a "Udfordr" button.
- **Live ticker.** While the kitchen is in a live battle, a slim bar on the buy page shows the
  standings and pops when someone moves ("Gl4 +6 🍺"). A sale on your own tablet bumps your number
  right away.
- **Scoreboard screen.** `/kollegiet/battle/{id}` full screen for a TV or projector at a party:
  big counters per kitchen, the burst of the last 20 minutes ("+20 på 20 min"), the lead
  changing hands, and confetti when the battle ends.
  - **Køkkener:** every kitchen as a card with emoji, colour and bio, and its wins, high-fives
    and badges as big pins (gold for wins). The kitchens with the most on their shelf come
    first: it is fine to brag.
- **Kom over nu (live call).** For a party still going at 1 at night: "📣 Kom over nu" on the
  board's write note opens a filled-in call (text, place, 1 to 3 hours) and sends it to every
  kitchen. It is an event of kind `live` in the kitchen's own document `events/live_{kid}`, so
  a kitchen has one call at most. The rules check that it is to everyone, starts when sent,
  lasts three hours at most, and that a new call comes 6 hours after the last one started at
  the earliest (ending early does not shorten the wait). It can be ended early ("Afslut
  kaldet" on its flyer) or its text changed, never moved, lengthened or deleted (a delete would
  reset the wait), so it cannot be used to spam. Kept small on purpose:
  While it goes on:
  - the other kitchens' buy page shows one slim bar with a pulsing dot above everything,
    however many calls there are: the newest, "+N kald mere", who, the text, until when, how
    many are coming, "Vi kommer" (one tap, again to take it back) and × ("Ikke nu", answers
    no, and that call is gone for the kitchen);
  - the kitchen that called sees "Jeres kald" with the faces of the kitchens coming;
  - it is the first thing in the strip on other pages, until it ends or is answered ("Ikke nu"
    answers no), seen or not;
  - on the board it is the first flyer, with a red edge and "NU".
  No new reads: the events listener is already open for the strip.
- **Kitchen profile:** opened from a card. A trophy shelf of big tiles (wins and poll titles in
  gold, high-fives, badges, achievements), the buttons for high-five, badge and challenge, and
  why it got its badges.
- **Worn badges.** The top bar shows the badges and high-fives the kitchen has been given, as
  pins after its name, so everyone at the tablet sees them. One given in the last day wiggles.
  Tapping them opens the kitchen's profile. It costs one listener on `standings/{kid}`, plus the
  kudos listener the shell already has for the bell.
- **Votes:** any kitchen starts a poll from the board ("Start en afstemning"). While it is
  open, a card at the top of the board: pick a kitchen, change your vote until it closes. Only
  your own vote is shown, never a running count. The winner is pinned on the board for three days
  and gets the title on its profile.
- **Gym counter:** "+1" (and −1 to undo a slip) on the battle's card on the Battles tab while a
  gym battle runs. Someone back from the gym taps it once. Not on the buy page, which is for
  purchases and an overview.
- **Maker:** does not play, start polls or battles, and does not moderate: what kitchens write to
  each other is up to them. The inbox shows only the league job's technical notes.

All text goes through `da.json` and `en.json`, with no long dashes.

## Battles

| Metric | The tally moves when | Notes |
|---|---|---|
| `drinks` | a sale (+ amount × buyers) or its undo (−) | Every product. |
| `beer` | as `drinks`, products with `category: 'beer'` | Needs a category on products (below). |
| `mealDiners` | someone signs up for or leaves a dinner in the period (±1) | Data the kitchen already has. |
| `plantMeals` | a dinner in the period is booked, tagged or untagged | Two counters, `vegetarian`/`vegan` meals and all meals; the score is the share. |
| `gym` | someone taps +1 (or −1) | Self-reported, trusted like the rest. |

**How a tally moves.**
- The page that makes the change (buy page, food club, the gym button on the Battles tab) adds a tally update for each
  live battle the kitchen is in to the batch it writes anyway. It knows them from the same
  `array-contains` listener.
- The update is an `increment()`. A sale for three people is one update of 3 × amount.
- The rules check:
  - the writer is a member of that kitchen;
  - the kitchen is in `participants`;
  - `from <= request.time < to`;
  - `updatedAt == request.time`;
  - the move is at most 400.
- That costs one extra rule read (the battle) and one extra write per sale.
- The rules cannot prove an increment matches a real purchase, so tallies are trusted, like the
  `sold` counter. The final result is not (below).

**Burst.** `ticks` keeps the last 30 increments. A tablet that has been watching also keeps every
change it saw. "+20 på 20 min" is the sum of ticks in the last 20 minutes, computed on the screen.

Battle rules:

- **Scoring is per kitchen, plain totals.** No dividing by residents: a small kitchen invites
  friends over and wins on numbers.
- **Joining.** A battle is live between `from` and `to` for the kitchens that joined. It is created
  at least 10 minutes ahead and lasts at most 31 days. A kitchen may join while it is live and
  starts from 0.
- **Ending.** At `to` the rules stop accepting increments, so the screen can call the winner on
  the spot. The job then recomputes each kitchen's number from the real purchases, meals and
  ticks, and writes `result`. If it differs from the tallies by more than a sale's worth, the job
  flags it to the maker and `result` wins. The trophy and the pinned result on the board come from `result`.

**Live achievements.** Some achievements are claimed by the kitchen's own tablet the moment they
happen, and the rules check the claim:
- `standings/{kid}/achievements/{code}` may be created only if the kitchen's tally in that battle
  has reached the threshold (`get()` of the tally).
- Examples: "100 øl i én battle", "Første battle", "Hat trick" (3 dinners in a row in the battle).
- Each one pops up on every screen watching the battle.

**Product categories.** Products get an optional `category`: `beer`, `cider`, `soda`, `water`,
`wine`, `spirits`, `snack` or `other`. Managers set it in the products dialog. A one-off ops script
proposes categories from product names for the maker to check, before any writes. The buy page
ignores it.

## The league job (`ops/league.js`)

The job is not on the live path. It settles and checks, on tokeserver like `admin-stats.js`, with
the same service account. It only writes `battles/{id}.result`, `polls/{id}.result`,
`standings/{kid}`. It posts nothing on the board: results are pinned by the app, achievements are on the profiles.

- **Every 15 minutes.** A state file on tokeserver (`--state`) keeps how far it has got, so a run
  looks only at battles and polls that ended since the last one: an idle run is 2 reads. A result
  and its trophy show up at most 15 minutes after the end.
- **Never twice.** The result is claimed with a precondition on the battle or poll document before
  anything is posted, so two runs at once (the 15-minute one and the daily one) cannot both settle
  it. The daily run is at 08:20, off the quarter hours anyway.
- **Settling a battle** reads what happened, once, when it has ended:
  - the kitchen's purchases in the period, added up (for `beer`, only beer products). An
    aggregation sum over a time range would need a composite index, so it is read instead: one
    read per purchase, about 400 for a busy Friday battle;
  - meals in the period (they are few);
  - gym is the tally itself.
  - A run spends at most 6,000 reads on recounting (`--max-reads`, estimated first with counts);
    a bigger battle waits for the next run, alone. A month-long beer battle for every kitchen is
    about 8,000 reads, once.
  - A live achievement claimed in the battle (beer50 and so on) that the real number does not
    reach is taken back and reported: tablets move the tally themselves, so it is not proof.
- **Achievements, once a day (08:20):** the ones that need history: 10/50/100 food club dinners, a
  month with half the meals plant based, first open kitchen party, 10 high-fives. They go to
  `standings/{kid}`, shown on the kitchen's profile. With the state it reads only the kudos and
  events since yesterday, counts the dinners (1 read per kitchen) and checks the plant-based month
  once, on the first run of the next month: about 30 reads a day, not growing with history.
- **Polls:** after `closesAt` the job counts the votes, writes `result`, gives the winner the badge
  and posts it. Ties share the badge.

## Cost

Rough daily reads on a busy Friday with 12 kitchens in one battle, about 20 tablets open and 400
sales:

| What | Reads |
|---|---|
| Rule read of the battle per sale | 400 |
| Each tablet sees each tally change (20 × 400) | 8,000 |
| Each tablet loading the battle and tallies at start or reload | ~300 |
| League job (96 idle runs, settling one battle, the daily run) | ~650 |
| Board, events and kudos listeners | ~1,000 |
| **Total on top of today's ~4,000** | **~10,000** |

That is about a quarter of the free 50k. The bigger risk is many battles at once, so:
- a kitchen can be in at most 3 live battles;
- a tablet listens to tallies only for battles its kitchen is in;
- everyone else sees the live battle when they open the Battles tab or the scoreboard screen.

Writes: one extra per sale, well inside 20k a day. The admin overview's usage chart shows it on
the first battle night, and `ops/usage.js` stays the check.

## Moderation and safety

- Kitchen managers can hide their own kitchen's posts; nobody else moderates. Hidden
  documents stay for the maker and are filtered from everyone else by the rules
  (`resource.data.hidden == false`). Queries therefore filter `hidden == false`, which needs an
  index with `createdAt`.
- No reporting to the maker: kitchens sort things out between themselves.
- Text limits are in the rules. No pictures in the first phases, because the Cloudinary upload
  preset is still unrestricted (#61).
- The privacy page gets a paragraph: what other kitchens see (the kitchen's name, profile, posts,
  kudos, and battle scores as kitchen totals), and that resident names are never shown.

## Phases

Epic: #149.

1. **Foundation (#144):** `kitchenLogin()`, `profiles`, `seen`, the Kollegiet page with the
   Køkkener tab, moderation (hide, report), the notification centre on top of #143, and the
   privacy text.
2. **Board and events (#145):** `posts`, replies, `events` with RSVP and broadcast, rate limit,
   strip items 2 and 4.
3. **High-fives and badges (#146):** `kudos`, profile badges, strip item 3.
4. **Battles (#147):** product categories (dialog and suggestion script), `battles` with live
   `tally`, tally updates in the sale, food club and gym batches, the buy page ticker, the
   scoreboard screen, live achievements, `ops/league.js` settling with the index, trophies.
5. **Votes and achievements (#148):** `polls`, `votes`, the job's tally and achievements,
   `standings`.

Each phase includes:

- rules plus rules tests (`rules-test/`), including a kitchen trying to write as another and an
  anonymous resident link trying to read;
- domain functions in `interfaces/*.ts` with unit tests;
- demo data in `ops/seed-demo.js`;
- a check on the emulators in light and dark, at tablet and phone sizes;
- dev first, then prod only when the maker asks.

## Decisions

- Live counters, conservative on reads.
- Gym is a tap counter.
- Always kitchen against kitchen; posts have no signatures.
- Votes are secret: a kitchen sees only its own vote; the job counts.
- Kitchens start polls themselves; the maker only moderates.
- Plain totals, never per resident.

