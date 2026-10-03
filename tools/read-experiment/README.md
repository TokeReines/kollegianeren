# When does Firestore bill a listener in full again?

`run.js` opens six headless browsers on dev, each listening to a different number of dev's public
`kitchens` documents (25, 21, 13, 8, 5, 3) with the app's Firebase version and offline cache, and
puts them through different patterns for two hours. `report.js` lines the logged events up with
Google's per-minute read count for dev, so a spike's size shows which browser caused it.

    NODE_PATH=<dir with playwright-core>/node_modules node run.js --minutes 120 --out /tmp/read-experiment
    node report.js --out /tmp/read-experiment

Signs nobody in; reads only the public kitchens collection.

## Result, 3 October 2026

| Pattern | Times | Billed each time |
| --- | --- | --- |
| Sleep (page frozen, network off) for 35 minutes, then wake | 3 | 21 of 21 (twice), 7 (once, likely a Monitoring gap) |
| Offline 35 minutes (not frozen), then online | 1 | 3 of 3 |
| Offline 12 minutes, then online | 1 | 0 |
| Network gone for 1 minute | 14 | 0 |
| Sleep 10 minutes, then wake | 9 | 0 |
| Page reloaded every 9 minutes | 12 | 0 |

So Firestore's 30-minute rule holds: a listener away for less than 30 minutes resumes for the cost
of what changed, while one away for longer is billed its whole result again, even when nothing
changed and the app is told nothing new. A tablet woken after half an hour pays for every list it
keeps open. That is why the app fetches the notification lists only when pulse/kollegiet says they
changed, and stops syncing two minutes after the screen goes off.
