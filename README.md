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
kitchens/{uid}                 one doc per kitchen, id == the kitchen's auth uid: {id, name}
kitchens/{uid}/products/{id}   name, price, retailPrice, active, clId (Cloudinary id)
kitchens/{uid}/users/{id}      residents: name, room, active, clId
kitchens/{uid}/purchases/{id}  productId/Name, userId/Name/Room, amount, price, timestamp
```

Security rules (`firestore.rules`) let a kitchen reach only its own subtree; tests in `rules-test/`.

## Deploy

```bash
npm run deploy:dev                                              # dev hosting
npm run build:prod && firebase deploy --only hosting --project prod   # prod: announce first
```

Prod is used every day. Deploy there only after the change has run on dev, and tell the kitchens first.

## Quotas

Spark allows 50k document reads per day and blocks the app for the rest of the day once they run out. `node ops/usage.js --project prod` shows daily usage.
