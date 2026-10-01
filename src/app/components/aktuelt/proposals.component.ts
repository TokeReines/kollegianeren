import {Component, TemplateRef, computed, effect, inject, signal, viewChild} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {DatePipe, NgTemplateOutlet} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {map, of, switchMap} from 'rxjs';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatSelectModule} from '@angular/material/select';
import {
  COMMENT_MAX, MAKER, PROPOSAL_BODY_MAX, PROPOSAL_IMAGES_MAX, PROPOSAL_STATUSES, PROPOSAL_TITLE_MAX, Proposal, ProposalComment,
  ProposalStatus, REPLY_IMAGES_MAX, sortProposals,
} from '../../interfaces/proposal';
import {AuthService} from '../../services/auth.service';
import {CloudinaryService, clUrl} from '../../services/cloudinary.service';
import {KollegietService} from '../../services/kollegiet.service';
import {MakerService} from '../../services/maker.service';
import {Notify} from '../../services/notify.service';
import {ProposalService} from '../../services/proposal.service';
import {TranslateService} from '../../services/translate.service';
import {millis} from '../../time';
import {TranslatePipe} from '../../translate.pipe';
import {Confirm} from '../confirm-dialog/confirm-dialog.component';
import {KitchenChipComponent} from '../kollegiet/kitchen-chip.component';

// Forslag (docs/aktuelt.md): the maker's proposals as cards, most wanted first. A card opens with
// its pictures and comments; kitchens comment and give a thumbs up, the maker answers with text and
// pictures, and moves it along: open, planned, implemented, or not happening.
@Component({
  selector: 'app-proposals',
  imports: [DatePipe, NgTemplateOutlet, FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatProgressSpinnerModule, MatSelectModule, TranslatePipe, KitchenChipComponent],
  templateUrl: './proposals.component.html',
  styleUrl: './proposals.component.scss',
})
export class ProposalsComponent {
  private readonly proposals = inject(ProposalService);
  private readonly auth = inject(AuthService);
  private readonly kollegiet = inject(KollegietService);
  private readonly cloudinary = inject(CloudinaryService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly i18n = inject(TranslateService);
  protected readonly isAdmin = inject(MakerService).isAdmin;

  private readonly all = toSignal(this.proposals.list(), {initialValue: []});
  protected readonly sorted = computed(() => sortProposals(this.all()));
  protected readonly statuses = PROPOSAL_STATUSES;
  protected readonly maker = MAKER;
  protected readonly commentMax = COMMENT_MAX;
  protected readonly titleMax = PROPOSAL_TITLE_MAX;
  protected readonly bodyMax = PROPOSAL_BODY_MAX;

  // The kitchen this login belongs to, if it is a kitchen's (the maker's own login is not).
  protected readonly me = computed(() => {
    const kid = this.auth.membership()?.kitchenId;
    return kid && this.kollegiet.byId().has(kid) ? kid : null;
  });

  // Comments per proposal: counted once per proposal (one read each), again after commenting.
  protected readonly counts = signal<Record<string, number>>({});
  private readonly counted = new Set<string>();

  // The proposal opened, live, with its comments.
  private readonly detailTpl = viewChild.required<TemplateRef<unknown>>('detailDialog');
  private readonly editTpl = viewChild.required<TemplateRef<unknown>>('editDialog');
  private detailRef: MatDialogRef<unknown> | null = null;
  private editRef: MatDialogRef<unknown> | null = null;
  protected readonly openId = signal<string | null>(null);
  protected readonly openProposal = computed(() => this.all().find(p => p.id === this.openId()) ?? null);
  // Tagged with the proposal they belong to, so a count is never taken from the one opened before.
  private readonly thread = toSignal(toObservable(this.openId).pipe(
    switchMap(id => id ? this.proposals.comments(id).pipe(map(list => ({id, list}))) : of({id: null as string | null, list: [] as ProposalComment[]}))),
    {initialValue: {id: null as string | null, list: [] as ProposalComment[]}});
  protected readonly comments = computed(() => this.thread().id === this.openId() ? this.thread().list : []);
  protected readonly text = signal('');
  protected readonly replyImages = signal<string[]>([]);

  // The maker's form: a new proposal, or changing one.
  protected readonly editing = signal<Proposal | null>(null);
  protected readonly form = {title: signal(''), body: signal(''), images: signal<string[]>([]), status: signal<ProposalStatus>('open')};
  protected readonly uploading = signal(false);

  constructor() {
    // An opened proposal listens to its comments anyway: its count follows them.
    effect(() => {
      const {id, list} = this.thread();
      if (id) {
        this.counts.update(c => c[id] === list.length ? c : {...c, [id]: list.length});
      }
    });
    effect(() => {
      for (const p of this.all()) {
        if (!this.counted.has(p.id)) {
          this.counted.add(p.id);
          this.recount(p.id);
        }
      }
    });
  }

  private recount(id: string) {
    this.proposals.commentCount(id).then(n => this.counts.update(c => ({...c, [id]: n})), () => undefined);
  }

  protected img(publicId: string, transformation = 'c_limit,w_1600,q_auto') {
    return clUrl(publicId, transformation, 'jpg');
  }

  protected votes(p: Proposal) {
    return Object.keys(p.votes ?? {}).length;
  }

  protected voted(p: Proposal) {
    return !!this.me() && !!p.votes?.[this.me()!];
  }

  protected vote(p: Proposal) {
    if (this.me()) {
      this.proposals.vote(p, !this.voted(p)).catch(this.notify.error);
    }
  }

  protected open(p: Proposal) {
    this.openId.set(p.id);
    this.text.set('');
    this.replyImages.set([]);
    this.detailRef = this.dialog.open(this.detailTpl(), {width: '760px', maxWidth: '96vw', autoFocus: false});
    this.detailRef.afterClosed().subscribe(() => this.openId.set(null));
  }

  protected send(p: Proposal) {
    const text = this.text().trim();
    if (!text) {
      return;
    }
    const done = () => {
      this.text.set('');
      this.replyImages.set([]);
      this.recount(p.id);
    };
    (this.isAdmin() ? this.proposals.reply(p, text, this.replyImages()) : this.proposals.comment(p, text)).then(done,
      err => this.notify.info(String(err).includes('permission') ? this.i18n.t('KOL_TOO_SOON') : String(err)));
  }

  protected mayRemove(c: ProposalComment) {
    return this.isAdmin() || (c.from === this.me() && Date.now() - millis(c.createdAt) < 5 * 60e3);
  }

  protected async remove(p: Proposal, c: ProposalComment) {
    if (await this.confirm.ask({title: this.i18n.t('FORSLAG_REMOVE'), message: this.i18n.t('FORSLAG_REMOVE_TEXT'),
      confirm: this.i18n.t('FORSLAG_REMOVE'), danger: true})) {
      this.proposals.removeComment(p, c).then(() => this.recount(p.id), this.notify.error);
    }
  }

  protected setStatus(p: Proposal, status: ProposalStatus) {
    this.proposals.setStatus(p, status).catch(this.notify.error);
  }

  protected edit(p: Proposal | null) {
    this.editing.set(p);
    this.form.title.set(p?.title ?? '');
    this.form.body.set(p?.body ?? '');
    this.form.images.set([...(p?.images ?? [])]);
    this.form.status.set(p?.status ?? 'open');
    this.editRef = this.dialog.open(this.editTpl(), {width: '640px', maxWidth: '96vw'});
  }

  protected save() {
    const fields = {title: this.form.title().trim(), body: this.form.body().trim(), images: this.form.images(), status: this.form.status()};
    if (!fields.title) {
      return;
    }
    const p = this.editing();
    (p ? this.proposals.update(p, fields) : this.proposals.create(fields)).then(() => this.editRef?.close(), this.notify.error);
  }

  // Pictures for a proposal or an answer: uploaded to Cloudinary, kept as public ids.
  protected async upload(input: HTMLInputElement, into: 'form' | 'reply') {
    const files = [...(input.files ?? [])];
    input.value = '';
    const target = into === 'form' ? this.form.images : this.replyImages;
    const max = into === 'form' ? PROPOSAL_IMAGES_MAX : REPLY_IMAGES_MAX;
    this.uploading.set(true);
    try {
      for (const f of files.slice(0, Math.max(0, max - target().length))) {
        const id = await this.cloudinary.upload(f);
        target.update(list => [...list, id]);
      }
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.uploading.set(false);
    }
  }

  protected dropImage(into: 'form' | 'reply', id: string) {
    (into === 'form' ? this.form.images : this.replyImages).update(list => list.filter(x => x !== id));
  }

  protected canUpload(into: 'form' | 'reply') {
    const n = (into === 'form' ? this.form.images : this.replyImages)().length;
    return this.cloudinary.canUpload && !this.uploading() && n < (into === 'form' ? PROPOSAL_IMAGES_MAX : REPLY_IMAGES_MAX);
  }
}
