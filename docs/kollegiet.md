# Kollegiet: play between the kitchens

Design for a shared space where kitchens talk to each other, invite each other, compete and
give each other recognition. Nothing here is built yet. It is split into phases that each ship on
their own (dev first, then prod), tracked in the issues listed under Phases.

## Goals

- **Contact:** kitchens write to each other, invite each other to parties and broadcast events to
  everyone ("Åbent køkken fredag kl. 21").
- **Battles:** a kitchen challenges one kitchen or all of them. Examples: "most food club diners in
  October", "most drinks on Friday", "most gym visits this week".
- **Recognition:** high-fives, badges given by other kitchens ("Gode venner", "Bedste fest"),
  achievements the app hands out, and monthly votes ("Bedst til genbrug", "Mest plantebaseret").

## Constraints

- **Zero cost.** Spark plan, so no Cloud Functions. Anything computed across kitchens runs on
  tokeserver: the cron that already writes `adminStats/latest` (`ops/admin-stats.js`).
- **Reads.** The quota is 50k reads a day and prod uses about 4k now. Every open tablet pays one
  read per new document it listens to. So each listener is limited (newest 50, last 30 days), and
  scores are written as one document per battle.
- **Kitchens, not residents.** Everything is shown per kitchen. Resident names, purchases and
  sign-ups never leave their kitchen. Scores are kitchen totals, never a per-resident list.
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
| Post, reply, RSVP, high-five, badge, vote, join a battle, gym check-in | yes | yes | yes | yes |
| Start a battle, create an event | yes | yes | yes | yes |
| Hide a post by their own kitchen | no | yes | yes | yes |
| Hide anything, create polls, end a battle | no | no | no | yes |
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
| `battles/{id}` | `kitchenId` (challenger), `title`, `metric`, `from`, `to`, `perResident` (bool), `invited` (`all` or kitchen ids), `joined` (map kitchen id → timestamp), `createdAt`, `status` | the challenger creates; others add only their own `joined` key; the job writes `scores` and `status` | See Battles. |
| `battles/{id}` field `scores` | map kitchen id → `{value, rank}`, `scoredAt` | ops job only | One document per battle, so a tablet pays one read per score update. |
| `checkins/{kid}_{day}` | `kitchenId`, `day`, `gym` (0 to 30, people who went) | any member of `kid`, only on that day | Self-reported. One document per kitchen and day, so it cannot be inflated by repeated taps. |
| `kudos/{id}` | `from`, `to`, `kind` (`highfive` or `badge`), `badge` (from a fixed list), `reason` (≤ 140), `createdAt`, `hidden` | any member of `from`, `to != from` | A high-five's id is `{from}_{to}_{day}`, so one per kitchen pair per day. |
| `polls/{id}` | `title`, `category`, `opensAt`, `closesAt`, `result` (written by the job) | maker | "Bedst til genbrug, oktober". |
| `votes/{poll}_{kid}` | `poll`, `from`, `choice`, `createdAt` | any member of `from`, not for itself, before `closesAt` | The document id gives one vote per kitchen. Readable only by the maker and the job (secret ballot); the job writes the result. |
| `standings/{kid}` | `achievements`, `badges` (counts), `wins`, `updatedAt` | ops job only | The kitchen's trophy shelf on its profile. |
| `seen/{kid}` | `kollegietAt` | any member of `kid` | When the kitchen last opened Kollegiet, for the badge and the strip. |
| `reports/{id}` | `kitchenId` (reporter), `target` (path), `createdAt` | any member | Read by the maker only; shown in the maker's inbox. |

Rate limits without functions:

- High-fives and check-ins are limited by their document ids.
- Posts carry the time, and the rules check `createdAt == request.time`.
- A kitchen's `seen` doc gets a `lastPostAt` that the post must update in the same batch. The rule
  requires `request.time > lastPostAt + 30s`, with `getAfter` as in the invite flow. That gives
  one post per 30 seconds per kitchen.

## Notifications

PR #143 adds a strip under the top bar and a bell for an unread message from the maker. It
becomes a small notification centre with one source list, shown in this order:

1. a message from the maker (#143);
2. an invitation or challenge to your kitchen (an event or battle with you in `invited`);
3. a badge or high-five your kitchen received;
4. an event for everyone, starting within 3 days;
5. new posts on the board: only a badge on the Kollegiet menu item, not the strip.

The strip shows the top item and opens it. Unseen means newer than `seen/{kid}.kollegietAt`,
worked out from listeners Kollegiet keeps anyway, so no extra queries. Opening Kollegiet updates
`kollegietAt`. A tablet would otherwise show the strip all evening, so it may also be dismissed.
Dismissing it updates the same field.

## Screens

- **Kollegiet** (new menu item, everyone). Three tabs:
  - **Opslagstavle:** posts, events and kudos mixed, newest first, with a composer that also
    creates an event.
  - **Battles:** live battles with their scoreboard and a button to join. Below that, past
    battles, then a "Udfordr" button.
  - **Køkkener:** every kitchen as a card with emoji, colour, bio, badges and trophies, plus
    buttons for high-five, give a badge and challenge.
- **Kitchen profile:** opened from a card. Its badges with reasons, achievements, battle wins,
  upcoming events.
- **Votes:** a card at the top of the board while a poll is open: pick a kitchen, change your
  vote until it closes. The result becomes a post and a badge for the winner.
- **Gym check-in:** a "Vi var i fitness" button with a 1 to 30 counter for today, shown on the
  Battles tab while a gym battle runs.
- **Maker:** a Hide action on everything, reports in the inbox, and poll creation on Aktuelt.

All text goes through `da.json` and `en.json`, with no long dashes.

## Battles

| Metric | Measured from | Notes |
|---|---|---|
| `mealDiners` | meals in the period: sum of `signups.length` | Data the kitchen already has. |
| `plantMeals` | share of meals tagged `vegetarian` or `vegan` | Also feeds the "Mest plantebaseret" achievement without a vote. |
| `drinks` | sum of `amount` over purchases in the period | Every product. |
| `beer` | as `drinks`, only products with `category: 'beer'` | Needs a category on products (below). |
| `gym` | sum of `checkins` in the period | Self-reported. |

Battle rules:

- **Scoring is per kitchen.** `perResident` divides by the kitchen's active residents, so a small
  kitchen can beat a big one. The challenger picks it, and it defaults to on for drinks and beer.
- **Joining.** A battle starts once at least one invited kitchen has joined. It starts in the
  future (at least an hour ahead) and lasts at most 31 days.
- **Ending.** The last score after `to` is final. The winner gets a trophy in `standings`, and the
  result is posted on the board.

**Product categories.** Products get an optional `category`: `beer`, `cider`, `soda`, `water`,
`wine`, `spirits`, `snack` or `other`. Managers set it in the products dialog. A one-off ops script
proposes categories from product names for the maker to check, before any writes. The buy page
ignores it.

## The league job (`ops/league.js`)

The job runs on tokeserver like `admin-stats.js`, with the same service account. It only writes
`battles/{id}.scores`, `battles/{id}.status`, `polls/{id}.result`, `standings/{kid}` and the result
posts.

- **Every 30 minutes from 16:00 to 02:00 Danish time,** and once at 08:15. If no battle is live or
  just ended, it stops after one query (1 read).
- **Counts and sums are aggregation queries**, at 1 read per 1000 documents:
  - `sum(amount)` over a kitchen's purchases in the period, filtered by product id for `beer`;
  - meals are few, so they are read directly.
  - The `productId in [...]` + `timestamp` sum needs a composite index. It is created through the
    Firestore Admin API, like `deploy-rules.js`, because the CLI needs the Service Usage API.
- **Cost:** a live battle between 12 kitchens costs about 12 to 24 reads a run, 21 runs a day:
  about 500 reads a day. Each update costs every open tablet one read.
- **Achievements, once a day (08:15):** first open kitchen party, 10/50/100 food club dinners, a
  month with half the meals plant based, first battle won, 10 high-fives. They go to
  `standings/{kid}`, and a new one becomes a post.
- **Polls:** after `closesAt` the job counts the votes, writes `result`, gives the winner the badge
  and posts it. Ties share the badge.

## Moderation and safety

- Kitchen managers can hide their own kitchen's posts. The maker can hide anything. Hidden
  documents stay for the maker and are filtered from everyone else by the rules
  (`resource.data.hidden == false`). Queries therefore filter `hidden == false`, which needs an
  index with `createdAt`.
- **Report** on every post, event and kudos creates `reports/{id}` and shows in the maker's inbox
  with a link.
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
4. **Battles (#147):** product categories (dialog and suggestion script), `battles`, `checkins`,
   `ops/league.js` with the index, scoreboards, trophies.
5. **Votes and achievements (#148):** `polls`, `votes`, the job's tally and achievements,
   `standings`.

Each phase includes:

- rules plus rules tests (`rules-test/`), including a kitchen trying to write as another and an
  anonymous resident link trying to read;
- domain functions in `interfaces/*.ts` with unit tests;
- demo data in `ops/seed-demo.js`;
- a check on the emulators in light and dark, at tablet and phone sizes;
- dev first, then prod only when the maker asks.

## Open questions

- **Signatures.** Posts are from the kitchen. Should a post carry an optional free-text signature
  ("Mads")? It would put a name in front of other kitchens. Proposal: allow it as free text, never
  linked to a resident.
- **Votes: secret or open?** Proposal: secret, with the tally done by the job.
- **Who creates polls?** Proposal: the maker, with kitchens suggesting categories on the board.
- **Drinking battles.** Proposal: `perResident` on by default, and the board shows kitchen totals
  only.
