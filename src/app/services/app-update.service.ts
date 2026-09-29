import {Injectable, NgZone} from '@angular/core';
import {SwUpdate} from '@angular/service-worker';
import {BehaviorSubject, fromEvent, merge} from 'rxjs';
import {filter} from 'rxjs/operators';

// Kitchen tablets stay open for weeks. Look for a new version every few hours and switch to it
// once nobody has touched the screen for a while, so nobody loses a half-made purchase.
const CHECK_EVERY_MS = 4 * 3600e3;
const IDLE_BEFORE_RELOAD_MS = 2 * 60e3;

@Injectable({
  providedIn: 'root'
})
export class AppUpdateService {
  online = new BehaviorSubject<boolean>(typeof navigator === 'undefined' || navigator.onLine);
  private lastTouch = Date.now();

  constructor(private sw: SwUpdate, private zone: NgZone) {
  }

  start() {
    merge(fromEvent(window, 'online'), fromEvent(window, 'offline'))
      .subscribe(() => this.zone.run(() => this.online.next(navigator.onLine)));
    for (const e of ['pointerdown', 'keydown']) {
      window.addEventListener(e, () => this.lastTouch = Date.now(), {passive: true});
    }
    if (!this.sw.isEnabled) {
      return;
    }
    this.zone.runOutsideAngular(() => setInterval(() => this.sw.checkForUpdate().catch(() => undefined), CHECK_EVERY_MS));
    this.sw.versionUpdates.pipe(filter(e => e.type === 'VERSION_READY')).subscribe(() => this.reloadWhenIdle());
    this.sw.unrecoverable.subscribe(() => document.location.reload());
  }

  private reloadWhenIdle() {
    this.zone.runOutsideAngular(() => {
      const timer = setInterval(() => {
        if (Date.now() - this.lastTouch > IDLE_BEFORE_RELOAD_MS) {
          clearInterval(timer);
          document.location.reload();
        }
      }, 15e3);
    });
  }
}
