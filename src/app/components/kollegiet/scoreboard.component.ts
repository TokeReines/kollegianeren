import {Component, computed, effect, inject, signal, untracked} from '@angular/core';
import {Location} from '@angular/common';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {ActivatedRoute, Router} from '@angular/router';
import {interval, map, of, switchMap} from 'rxjs';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {BURST_MINUTES, battleState, scoreboard} from '../../interfaces/kollegiet';
import {KollegietService} from '../../services/kollegiet.service';
import {LeagueService} from '../../services/league.service';
import {millis} from '../../time';
import {TranslatePipe} from '../../translate.pipe';
import {KitchenChipComponent} from './kitchen-chip.component';
import {liveBoard} from './live-board';

// A battle full screen, for a TV or a projector at a party: big counters, who just moved, the
// lead changing hands, and confetti when it is over.
@Component({
  selector: 'app-scoreboard',
  imports: [MatButtonModule, MatIconModule, TranslatePipe, KitchenChipComponent],
  templateUrl: './scoreboard.component.html',
  styleUrl: './scoreboard.component.scss',
})
export class ScoreboardComponent {
  private readonly league = inject(LeagueService);
  protected readonly kollegiet = inject(KollegietService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  // Opened from a page in the app (the buy page's strip, Kollegiet), or straight from a link, as on a TV.
  private readonly openedInApp = ((this.location.getState() as {navigationId?: number} | null)?.navigationId ?? 1) > 1;
  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map(p => p.get('id') ?? '')), {initialValue: ''});

  protected readonly battle = computed(() => this.league.battles().find(b => b.id === this.id()) ?? null);
  private readonly tallies = toSignal(toObservable(this.id).pipe(switchMap(id => id ? this.league.tallies(id) : of([]))), {initialValue: null});
  // Every second, for the countdown and the burst window.
  private readonly clock = toSignal(interval(1000).pipe(map(() => Date.now())), {initialValue: Date.now()});
  protected readonly state = computed(() => {
    const b = this.battle();
    return b ? battleState(b, this.clock()) : null;
  });
  protected readonly rows = computed(() => {
    const b = this.battle();
    return b ? scoreboard(b, this.tallies() ?? [], this.clock()) : [];
  });
  protected readonly max = computed(() => Math.max(1, ...this.rows().map(r => r.score)));
  protected readonly live = liveBoard(this.rows, computed(() => this.tallies() && this.battle() ? this.id() : ''));
  protected readonly burstMinutes = BURST_MINUTES;
  protected readonly icon = computed(() => {
    const b = this.battle();
    return b ? LeagueService.metricIcon(b.metric) : 'emoji_events';
  });
  protected readonly confetti = signal(false);
  protected readonly pieces = Array.from({length: 60}, (_, i) => ({left: (i * 37) % 100, delay: (i % 12) * 0.25, hue: (i * 47) % 360}));

  // "2:14:05" left, or until it starts.
  protected readonly countdown = computed(() => {
    const b = this.battle();
    if (!b) {
      return '';
    }
    const target = this.state() === 'upcoming' ? millis(b.from) : millis(b.to);
    const s = Math.max(0, Math.floor((target - this.clock()) / 1000));
    const pad = (n: number) => String(n).padStart(2, '0');
    const days = Math.floor(s / 86400);
    return `${days ? days + 'd ' : ''}${Math.floor(s / 3600) % 24}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  });

  constructor() {
    // Confetti when it ends while the screen is on, and for a minute on a fresh look at the result.
    let wasLive = false;
    effect(() => {
      const state = this.state();
      untracked(() => {
        if (state === 'live') {
          wasLive = true;
        } else if (state === 'ended' && (wasLive || this.clock() - millis(this.battle()?.to) < 60e3)) {
          wasLive = false;
          this.confetti.set(true);
          setTimeout(() => this.confetti.set(false), 8000);
        }
      });
    });
  }

  protected width(score: number) {
    return `${Math.max(4, 100 * score / this.max())}%`;
  }

  // Back to the page it was opened from; to Kollegiet's battles when there is none.
  protected back() {
    if (this.openedInApp) {
      this.location.back();
    } else {
      this.router.navigate(['/kollegiet'], {queryParams: {tab: 'battles'}});
    }
  }
}
