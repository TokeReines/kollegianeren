import {Injectable, inject, signal} from '@angular/core';
import {SwUpdate} from '@angular/service-worker';
import {filter} from 'rxjs';

// Kitchen tablets stay open for weeks. Look for a new version every few hours and switch to it
// once nobody has touched the screen for a while, so nobody loses a half-made purchase.
const CHECK_EVERY_MS = 4 * 3600e3;
const IDLE_BEFORE_RELOAD_MS = 2 * 60e3;

@Injectable({providedIn: 'root'})
export class AppUpdateService {
  private readonly sw = inject(SwUpdate);
  readonly online = signal(navigator.onLine);
  private lastTouch = Date.now();
  private started = false;

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
    setInterval(() => this.sw.checkForUpdate().catch(() => undefined), CHECK_EVERY_MS);
    this.sw.versionUpdates.pipe(filter(e => e.type === 'VERSION_READY')).subscribe(() => this.reloadWhenIdle());
    this.sw.unrecoverable.subscribe(() => document.location.reload());
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
