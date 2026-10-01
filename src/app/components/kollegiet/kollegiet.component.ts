import {Component, DestroyRef, computed, inject} from '@angular/core';
import {takeUntilDestroyed, toSignal} from '@angular/core/rxjs-interop';
import {ActivatedRoute, Router} from '@angular/router';
import {map} from 'rxjs';
import {MatTabsModule} from '@angular/material/tabs';
import {showAnchor} from '../../anchor';
import {KollegietService} from '../../services/kollegiet.service';
import {TranslatePipe} from '../../translate.pipe';
import {BattlesComponent} from './battles.component';
import {BoardComponent} from './board.component';
import {KitchensComponent} from './kitchens.component';

const TABS = ['board', 'battles', 'kitchens'] as const;

// Kollegiet: the kitchens of the dorm together (docs/kollegiet.md). Opening it counts as having
// seen what is new, for the strip and the bell.
@Component({
  selector: 'app-kollegiet',
  imports: [MatTabsModule, TranslatePipe, BattlesComponent, BoardComponent, KitchensComponent],
  template: `
    <div class="page">
      <h1>{{ "KOL_TITLE" | translate }}</h1>
      <mat-tab-group [selectedIndex]="index()" (selectedIndexChange)="go($event)" mat-stretch-tabs="false" animationDuration="0ms">
        <mat-tab [label]="'KOL_TAB_BOARD' | translate"><ng-template matTabContent><app-board /></ng-template></mat-tab>
        <mat-tab [label]="'KOL_TAB_BATTLES' | translate"><ng-template matTabContent><app-battles /></ng-template></mat-tab>
        <mat-tab [label]="'KOL_TAB_KITCHENS' | translate"><ng-template matTabContent><app-kitchens /></ng-template></mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `
    h1 { margin: 0 0 8px; }
    mat-tab-group { --mat-tab-container-height: 52px; }
  `,
})
export class KollegietComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly kollegiet = inject(KollegietService);

  private readonly tab = toSignal(this.route.queryParamMap.pipe(map(q => q.get('tab'))), {initialValue: null});
  protected readonly index = computed(() => Math.max(0, TABS.indexOf((this.tab() ?? 'board') as typeof TABS[number])));

  constructor() {
    const seen = () => this.kollegiet.markSeen().catch(() => undefined);
    seen();
    inject(DestroyRef).onDestroy(seen);
    // From the strip: #battle-… or #event-…, once the tab has loaded it.
    this.route.fragment.pipe(takeUntilDestroyed()).subscribe(fragment => fragment && showAnchor(fragment));
  }

  protected go(index: number) {
    this.router.navigate([], {queryParams: {tab: TABS[index]}, replaceUrl: true});
  }
}
