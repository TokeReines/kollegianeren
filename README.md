# Kollegianeren

The beer tab for the kitchens at Egmont Kollegiet: each kitchen logs in on a shared tablet, residents tap a product and their name, and the treasurer exports a monthly statement. Built in 2018, in daily use since.

Angular 22 + Angular Material, Firebase Auth and Firestore (free Spark plan), product and resident photos on Cloudinary.

## Projects

| | Firebase project | URL | Build |
|---|---|---|---|
| **Prod** | `firebase-ehp` (alias `prod`) | https://ehp.web.app | `npm run build:prod` |
| Dev | `kollegianeren` (alias `dev`) | https://kollegianeren.web.app | `npm run build:dev` |
| Local | emulators, project `demo-kollegianeren` | http://localhost:4200 | `npm start` |

Plain `ng build` / `ng serve` target the local emulators, so nothing talks to prod by accident.

## Develop locally

Node 22 (`nvm use`), Java 21 for the Firestore emulator, `firebase-tools` installed globally.

```bash
npm install
npm run emulators   # auth + firestore, seeded from ~/kollegianeren-emulator-data
npm start           # second terminal, http://localhost:4200
```

The seed data is an anonymised copy of prod made with `ops/restore.js` (see `ops/README.md`). Emulator-only logins for every kitchen are in `~/kollegianeren-emulator-data/accounts.json`.

## Data model

```
kitchens/{kid}                 {id, name}; public (register suggestions, maker inbox names)
kitchens/{kid}/products/{id}   name, price, retailPrice, active, clId (Cloudinary id)
kitchens/{kid}/users/{id}      residents: name, room, active, clId
kitchens/{kid}/purchases/{id}  productId/Name, userId/Name/Room, amount, price, timestamp
kitchens/{kid}/messages/{id}   "Skriv til Toke" thread: text, from, createdAt, seenByMaker/Kitchen
kitchens/{kid}/members/{uid}   extra logins: role, email, joinedAt
memberships/{uid}              which kitchen an invited login belongs to: kitchenId, role, invite
invites/{code}                 join a kitchen (treasurer/tablet) or, kitchenId null, create one (owner)
announcements/{id}             "Aktuelt" posts
admins/{uid}                   the maker; created only in the Firebase console
```

Kitchens from before 2026 have `kid ==` their original login's uid and no membership: that login is the owner. Everyone else joins with an invite. Roles: **owner** (everything, removes logins), **treasurer** (products, residents, accounting, invites), **tablet** (buy, undo within a minute).

Security rules (`firestore.rules`) enforce all of this; tests in `rules-test/` (`npm test` there).

## Deploy

```bash
npm run deploy:dev                                              # dev hosting
npm run build:prod && firebase deploy --only hosting --project prod   # prod: announce first
```

Prod is used every day. Deploy there only after the change has run on dev, and tell the kitchens first.

## Quotas

Spark allows 50k document reads per day and blocks the app for the rest of the day once they run out. `node ops/usage.js --project prod` shows daily usage.
