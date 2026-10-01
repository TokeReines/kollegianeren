import {Injectable, inject, signal} from '@angular/core';
import {SwUpdate} from '@angular/service-worker';
import {doc, serverTimestamp, setDoc} from 'firebase/firestore';
import {filter} from 'rxjs';
import {db} from '../firebase';

// Kitchen tablets stay open for weeks. Look for a new version every few hours, and whenever the
// screen wakes up (sleeping tablets pause timers), and switch to it once nobody has touched the
// screen for a while, so nobody loses a half-made purchase.
const CHECK_EVERY_MS = 4 * 3600e3;
const CHECK_ON_WAKE_AFTER_MS = 10 * 60e3;
const IDLE_BEFORE_RELOAD_MS = 2 * 60e3;

// The running build: the main bundle's content hash, e.g. "PJ72EFS3" from main-PJ72EFS3.js.
// Null under ng serve, which has no hash.
export function runningBuild(): string | null {
  const src = document.querySelector<HTMLScriptElement>('script[src*="main-"]')?.getAttribute('src') ?? '';
  return /main-([\w-]+)\.js/.exec(src)?.[1] ?? null;
}

@Injectable({providedIn: 'root'})
export class AppUpdateService {
  private readonly sw = inject(SwUpdate);
  readonly online = signal(navigator.onLine);
  private lastTouch = Date.now();
  private lastCheck = Date.now();
  private started = false;
  private reported = '';

  // Called once from the app root, so the login page updates too.
  start() {
    if (this.started) {
      return;
    }
    this.started = true;
    for (const e of ['online', 'offline']) {
      window.addEventListener(e, () => this.online.set(navigator.onLine));
    }
    for (const e of ['pointerdown', 'keydown']) {
      window.addEventListener(e, () => this.lastTouch = Date.now(), {passive: true});
    }
    if (!this.sw.isEnabled) {
      return;
    }
    setInterval(() => this.check(), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - this.lastCheck > CHECK_ON_WAKE_AFTER_MS) {
        this.check();
      }
    });
    this.sw.versionUpdates.pipe(filter(e => e.type === 'VERSION_READY')).subscribe(() => this.reloadWhenIdle());
    this.sw.unrecoverable.subscribe(() => document.location.reload());
  }

  // Tells the maker's Admin page which build this login runs: one small write per app start.
  reportVersion(kitchenId: string, uid: string) {
    const build = runningBuild();
    const key = `${kitchenId}/${uid}/${build}`;
    if (!build || key === this.reported) {
      return;
    }
    this.reported = key;
    setDoc(doc(db, 'kitchens', kitchenId, 'appVersions', uid), {build, loadedAt: serverTimestamp()}).catch(() => undefined);
  }

  private check() {
    this.lastCheck = Date.now();
    this.sw.checkForUpdate().catch(() => undefined);
  }

  private reloadWhenIdle() {
    const timer = setInterval(() => {
      if (Date.now() - this.lastTouch > IDLE_BEFORE_RELOAD_MS) {
        clearInterval(timer);
        document.location.reload();
      }
    }, 15e3);
  }
}
