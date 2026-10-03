import {Injectable} from '@angular/core';
import {disableNetwork, enableNetwork} from 'firebase/firestore';
import {db} from '../firebase';
import {meterWake} from '../read-meter';

// How long the screen is off before the app stops syncing.
const HIDDEN_BEFORE_OFFLINE_MS = 2 * 60e3;
// Firestore's resume window: after a longer break every open list is billed again in full.
const RESUME_MS = 30 * 60e3;

// A sleeping tablet still wakes up now and then in the background, and each time the app would
// reconnect every open list, which Firestore bills in full after half an hour away. So once the
// screen has been off for two minutes the app stops syncing, and starts again the moment the
// screen is on. Anything written meanwhile waits in the offline cache, as when offline.
@Injectable({providedIn: 'root'})
export class NetworkService {
  private timer?: ReturnType<typeof setTimeout>;
  private offSince = 0;

  start() {
    document.addEventListener('visibilitychange', () => {
      clearTimeout(this.timer);
      if (document.visibilityState === 'hidden') {
        this.timer = setTimeout(() => {
          this.offSince = Date.now();
          disableNetwork(db).catch(() => this.offSince = 0);
        }, HIDDEN_BEFORE_OFFLINE_MS);
      } else if (this.offSince) {
        // Back after a long break: what reconnecting costs, for the read meter.
        if (Date.now() - this.offSince > RESUME_MS) {
          meterWake();
        }
        this.offSince = 0;
        enableNetwork(db).catch(() => undefined);
      }
    });
  }
}
