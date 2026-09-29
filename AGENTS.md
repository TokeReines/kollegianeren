# Notes for coding agents

Kollegianeren is a dorm kitchen beer-tab app that is used every day. Read this before changing anything.

## Attribution

- No "Generated with Claude Code" (or any other tool) footers in pull requests, issues, comments or docs.
- No `Co-Authored-By:` trailers for AI tools in commit messages.
- Write commits and PRs as plain, human descriptions of the change.

## Projects and safety

- `kollegianeren` (kollegianeren.web.app) is the dev project; `firebase-ehp` (ehp.web.app) is production and holds real residents' data.
- Build and test against the local emulators or the dev project first. Nothing goes to production without the maintainer asking for it.
- Production checks are read-only. Never write test data to production.
- The project runs on the free Spark plan and must stay at zero cost: no Blaze, no Cloud Functions, no paid services.
- The repo is public. No keys, service-account files, real names or emails in commits. Demo data is anonymised or made up.

## Working locally

- `ops/README.md` covers the emulators, backups and demo data (`seed-emulator.js`, `seed-demo.js`, `seed-avatars.js`). Demo logins are in `~/kollegianeren-emulator-data/accounts.json`, which is never committed.
- Rules tests: `rules-test/` (`npm test` there, against the Firestore emulator).
- After editing `firestore.rules` from Windows (`\\wsl.localhost`), restart the Firestore emulator; it does not see the change.
- Check UI changes in a browser in light and dark, at tablet (1280x800) and phone (390x844) sizes, before calling them done.

## UI

- Angular with Angular Material 3 (`mat.theme()` in `src/styles.scss`). Use the `--mat-sys-*` tokens, never hard-coded colours (product photo tiles are the one exception).
- Outlined cards, outlined form fields, `matTooltip` rather than `title`, and `Confirm` (confirm-dialog) rather than `confirm()`/`prompt()`.
- Every user-facing string goes through `src/assets/i18n/da.json` and `en.json`.
- No long dashes (em or en dash) in user-facing text in either language. Use a full stop, comma or colon.

## Git

- Work in stacked PRs: each feature branch is based on the previous one, and each PR targets the branch below it.
- CI (`.github/workflows/ci.yml`) builds prod and dev and runs the rules tests; keep it green.
