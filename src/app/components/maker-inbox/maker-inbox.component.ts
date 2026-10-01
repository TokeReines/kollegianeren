import {Component, computed, effect, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatListModule} from '@angular/material/list';
import {of, switchMap} from 'rxjs';
import {MakerService} from '../../services/maker.service';
import {KollegietService, Report} from '../../services/kollegiet.service';
import {Thread} from '../../interfaces/message';
import {Notify} from '../../services/notify.service';
import {TranslatePipe} from '../../translate.pipe';

// The maker's inbox: every kitchen's thread, newest activity first. Admins only.
@Component({
  selector: 'app-maker-inbox',
  imports: [DatePipe, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatListModule, TranslatePipe],
  templateUrl: './maker-inbox.component.html',
  styleUrl: './maker-inbox.component.scss',
})
export class MakerInboxComponent {
  private readonly maker = inject(MakerService);
  private readonly notify = inject(Notify);

  protected readonly isAdmin = this.maker.isAdmin;
  protected readonly threads = toSignal(this.maker.inbox(), {initialValue: []});
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => this.threads().find(t => t.kitchenId === this.selectedId()));
  protected readonly text = signal('');

  // Reports from kitchens on Kollegiet, and from ops/league.js when a tally was off.
  private readonly kollegiet = inject(KollegietService);
  protected readonly reports = toSignal(this.maker.isAdmin$.pipe(switchMap(admin => admin ? this.kollegiet.reports() : of([]))), {initialValue: []});

  protected kitchenName(id: string) {
    return this.kollegiet.card(id).name;
  }

  protected resolve(report: Report, hide: boolean) {
    this.kollegiet.resolve(report, hide).catch(this.notify.error);
  }

  constructor() {
    // An open thread is read: new messages in it are marked seen as they arrive.
    effect(() => {
      const thread = this.selected();
      if (thread) {
        this.maker.markSeenByMaker(thread).catch(() => undefined);
      }
    });
  }

  protected open(thread: Thread) {
    this.selectedId.set(thread.kitchenId);
  }

  protected reply() {
    const text = this.text().trim();
    const kitchenId = this.selectedId();
    if (!text || !kitchenId) {
      return;
    }
    this.text.set('');
    this.maker.reply(kitchenId, text).catch(err => {
      this.text.set(text);
      this.notify.error(err);
    });
  }
}
