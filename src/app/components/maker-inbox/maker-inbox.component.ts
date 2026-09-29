import {ChangeDetectionStrategy, Component, OnDestroy} from '@angular/core';
import {MatSnackBar} from '@angular/material/snack-bar';
import {Subscription} from 'rxjs';
import {MakerService, Thread} from '../../services/maker.service';

// The maker's inbox: every kitchen's thread, newest activity first. Admins only.
@Component({
  selector: 'app-maker-inbox',
  templateUrl: './maker-inbox.component.html',
  styleUrls: ['./maker-inbox.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class MakerInboxComponent implements OnDestroy {
  isAdmin = this.maker.isAdmin;
  threads: Thread[] = [];
  selectedId: string | null = null;
  text = '';
  private sub: Subscription;

  constructor(private maker: MakerService, private snackBar: MatSnackBar) {
    this.sub = this.maker.inbox().subscribe(threads => {
      this.threads = threads;
      if (this.selected) {
        this.maker.markSeenByMaker(this.selected);
      }
    });
  }

  get selected(): Thread | undefined {
    return this.threads.find(t => t.kitchenId === this.selectedId);
  }

  open(thread: Thread) {
    this.selectedId = thread.kitchenId;
    this.maker.markSeenByMaker(thread);
  }

  reply() {
    const text = this.text.trim();
    this.text = '';
    this.maker.reply(this.selectedId, text).catch(err => {
      this.text = text;
      this.snackBar.open(err.message, 'OK', {duration: 6000});
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}
