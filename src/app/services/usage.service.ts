import {Injectable, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {NavigationEnd, Router} from '@angular/router';
import {doc, increment, setDoc} from 'firebase/firestore';
import {filter} from 'rxjs';
import {dayName} from '../components/stats/stats';
import {Counts, UsageAction, usagePage} from '../interfaces/usage';
import {AuthService} from './auth.service';
import {kitchenCollection} from './kitchen-data';

// Added to the kitchen's day now and then, and when the app goes to the background.
const FLUSH_EVERY_MS = 15 * 60e3;
const FIRST_FLUSH_MS = 60e3;
// Back after this long away counts as opening the app again.
const AWAY_MS = 30 * 60e3;

interface Pending {
  v: Counts;
  a: Counts;
  h: Counts;
}

// How the kitchens use the app, for the maker's Admin page (interfaces/usage.ts): page views and
// actions are counted on the device and added to kitchens/{kid}/usage/{day} a few times a day,
// split by tablet and managers. No reads, a handful of writes per login a day. Only kitchen logins
// count: not the maker, not resident links. ops/admin-stats.js sums them up every night.
@Injectable({providedIn: 'root'})
export class UsageService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly kitchen = toSignal(this.auth.kitchen$, {initialValue: null});
  // By day, so counts from before midnight land on the right day.
  private readonly pending = new Map<string, Pending>();
  private lastPage = '';
  private hiddenAt = 0;

  start() {
    this.act('open');
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe(e => {
      const page = usagePage(e.urlAfterRedirects);
      // A fragment or a reload of the same page is not another view.
      if (page && page !== this.lastPage) {
        this.count('v', page);
      }
      this.lastPage = page ?? '';
    });
    // Soon after start too, so a short visit (closed before it goes to the background) still counts.
    setTimeout(() => this.flush(), FIRST_FLUSH_MS);
    setInterval(() => this.flush(), FLUSH_EVERY_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.hiddenAt = Date.now();
        this.flush();
      } else if (this.hiddenAt && Date.now() - this.hiddenAt > AWAY_MS) {
        this.act('open');
      }
    });
    window.addEventListener('pagehide', () => this.flush());
  }

  act(action: UsageAction) {
    this.count('a', action);
  }

  private count(kind: 'v' | 'a', key: string) {
    const now = new Date();
    const day = dayName(now);
    const p = this.pending.get(day) ?? {v: {}, a: {}, h: {}};
    p[kind][key] = (p[kind][key] ?? 0) + 1;
    p.h[now.getHours()] = (p.h[now.getHours()] ?? 0) + 1;
    this.pending.set(day, p);
  }

  private flush() {
    const m = this.kitchen();
    if (!m || !this.pending.size) {
      // Not a kitchen (or not signed in yet): nothing to count for.
      this.pending.clear();
      return;
    }
    const who = m.role === 'tablet' ? 't' : 'm';
    for (const [day, p] of this.pending) {
      const fields: Record<string, Record<string, ReturnType<typeof increment>>> = {};
      for (const kind of ['v', 'a', 'h'] as const) {
        const entries = Object.entries(p[kind]);
        if (entries.length) {
          fields[kind] = Object.fromEntries(entries.map(([k, n]) => [k, increment(n)]));
        }
      }
      setDoc(doc(kitchenCollection(m.kitchenId, 'usage'), day), {[who]: fields}, {merge: true}).catch(() => undefined);
    }
    this.pending.clear();
  }
}
