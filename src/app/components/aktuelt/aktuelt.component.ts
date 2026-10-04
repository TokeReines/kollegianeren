import {Component, DestroyRef, computed, inject, signal, viewChild} from '@angular/core';
import {takeUntilDestroyed, toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import {firstValueFrom, map} from 'rxjs';
import {showAnchor} from '../../anchor';
import {NEWS_DAYS} from '../../interfaces/kollegiet';
import {Announcement} from '../../interfaces/message';
import {KollegietService} from '../../services/kollegiet.service';
import {millis} from '../../time';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatTabsModule} from '@angular/material/tabs';
import {MakerService} from '../../services/maker.service';
import {Notify} from '../../services/notify.service';
import {TranslatePipe} from '../../translate.pipe';
import {MakerChatComponent} from '../maker-chat/maker-chat.component';
import {AboutComponent} from './about.component';
import {ProposalsComponent} from './proposals.component';
import {PictureViewerDirective} from './picture-viewer';
import {RichEditorComponent} from './rich-editor.component';
import {asHtml} from './rich-text';

const TABS = ['nyt', 'forslag', 'om'] as const;

// "Aktuelt", the maker's page, next to the chat with him: news (admins post), Forslag (proposals
// the kitchens weigh in on, docs/aktuelt.md) and Om (what the app is, where the data is, what if).
@Component({
  selector: 'app-aktuelt',
  imports: [DatePipe, FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTabsModule,
    TranslatePipe, MakerChatComponent, ProposalsComponent, AboutComponent, PictureViewerDirective, RichEditorComponent],
  templateUrl: './aktuelt.component.html',
  styleUrl: './aktuelt.component.scss',
})
export class AktueltComponent {
  private readonly maker = inject(MakerService);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly tab = toSignal(this.route.queryParamMap.pipe(map(q => q.get('tab'))), {initialValue: null});
  protected readonly index = computed(() => Math.max(0, TABS.indexOf((this.tab() ?? 'nyt') as typeof TABS[number])));

  protected readonly announcements = toSignal(this.maker.announcements(), {initialValue: []});
  protected readonly isAdmin = this.maker.isAdmin;
  protected readonly title = signal('');
  // Cleaned HTML from the editor (bold, bullets, pictures); older posts are plain text.
  protected readonly body = signal('');
  protected readonly uploading = signal(false);
  private readonly editor = viewChild(RichEditorComponent);
  protected readonly asHtml = asHtml;

  // When the kitchen last looked, read before this visit counts: what is newer gets a "new" tag.
  protected readonly seenBefore = signal(Number.MAX_SAFE_INTEGER);

  constructor() {
    const kollegiet = inject(KollegietService);
    const seen = () => kollegiet.markAktueltSeen().catch(() => undefined);
    firstValueFrom(kollegiet.aktueltSeen$).then(at => this.seenBefore.set(at), () => undefined).finally(seen);
    inject(DestroyRef).onDestroy(seen);
    // From a notification: #news-… or #proposal-…, once the tab has loaded it.
    this.route.fragment.pipe(takeUntilDestroyed()).subscribe(f => (f?.startsWith('news-') || f?.startsWith('proposal-')) && showAnchor(f));
  }

  protected go(index: number) {
    this.router.navigate([], {queryParams: {tab: TABS[index]}, replaceUrl: true});
  }

  protected isNew(a: Announcement): boolean {
    return millis(a.createdAt) > Math.max(this.seenBefore(), Date.now() - NEWS_DAYS * 864e5);
  }

  protected post() {
    this.maker.postAnnouncement(this.title().trim(), this.body().trim()).then(() => {
      this.title.set('');
      this.editor()?.clear();
    }, this.notify.error);
  }
}
