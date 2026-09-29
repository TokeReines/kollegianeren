import {Component, computed, inject, input, resource} from '@angular/core';
import {DatePipe, DecimalPipe} from '@angular/common';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {ResidentLinkService} from '../../services/resident-link.service';
import {byMonth} from '../../services/residency';
import {TranslatePipe} from '../../translate.pipe';

// What a resident sees on their own phone from their private link: this month, the last months,
// and their latest purchases. No kitchen login involved.
@Component({
  selector: 'app-resident-view',
  imports: [DatePipe, DecimalPipe, MatProgressSpinnerModule, TranslatePipe],
  templateUrl: './resident-view.component.html',
  styleUrl: './resident-view.component.scss',
})
export class ResidentViewComponent {
  private readonly links = inject(ResidentLinkService);
  // From the route, /me/:token.
  readonly token = input.required<string>();
  private readonly result = resource({params: () => this.token(), loader: ({params}) => this.links.open(params).catch(() => null)});
  protected readonly loading = this.result.isLoading;
  protected readonly tab = computed(() => this.result.hasValue() ? this.result.value() : null);
  protected readonly months = computed(() => byMonth(this.tab()?.purchases ?? []));
  protected readonly recent = computed(() => (this.tab()?.purchases ?? []).slice(0, 50));
}
