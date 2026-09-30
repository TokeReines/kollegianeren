import {BreakpointObserver} from '@angular/cdk/layout';
import {Injectable, computed, effect, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {map} from 'rxjs';

const RAIL_KEY = 'kollegianeren.rail.hidden';

// The navigation: a slide-over menu on phones, a rail on tablets that can be hidden (kiosk mode,
// so the kitchen tablet shows only the buy page; remembered on the device).
@Injectable({providedIn: 'root'})
export class SidenavService {
  readonly narrow = toSignal(inject(BreakpointObserver).observe('(max-width: 760px)').pipe(map(s => s.matches)), {initialValue: false});
  readonly railHidden = signal(readRailHidden());
  readonly phoneMenuOpen = signal(false);
  readonly opened = computed(() => this.narrow() ? this.phoneMenuOpen() : !this.railHidden());
  readonly showsRail = computed(() => !this.narrow() && !this.railHidden());

  constructor() {
    effect(() => {
      const hidden = this.railHidden();
      try {
        localStorage.setItem(RAIL_KEY, hidden ? '1' : '0');
      } catch {
        // Not remembered; still applies until reload.
      }
    });
  }

  toggle(): void {
    if (this.narrow()) {
      this.phoneMenuOpen.update(open => !open);
    } else {
      this.railHidden.update(hidden => !hidden);
    }
  }
}

function readRailHidden(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === '1';
  } catch {
    return false;
  }
}
