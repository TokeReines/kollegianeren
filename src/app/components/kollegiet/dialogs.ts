import {Component, computed, inject, model, signal} from '@angular/core';
import {FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {Timestamp} from 'firebase/firestore';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatChipsModule} from '@angular/material/chips';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {
  BADGES, BATTLE_MAX_DAYS, BIO_MAX, Badge, EVENT_KINDS, KEvent, KITCHEN_COLOURS, KITCHEN_EMOJIS, KitchenColour, METRICS, Metric,
  Profile, REASON_MAX, TITLE_MAX,
} from '../../interfaces/kollegiet';
import {atTime} from '../../interfaces/meal';
import {EventFields, KollegietService} from '../../services/kollegiet.service';
import {BattleFields} from '../../services/league.service';
import {TranslatePipe} from '../../translate.pipe';
import {KitchenChipComponent} from './kitchen-chip.component';

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const DIALOG_STYLES = `
  form { display: flex; flex-direction: column; gap: 12px; }
  .first { margin-top: 8px; }
  .when { display: grid; grid-template-columns: 3fr 2fr; gap: 12px; }
  .label { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
  .who { display: flex; flex-direction: column; gap: 8px; }
  mat-button-toggle-group { align-self: flex-start; }
`;

// Who gets it: everyone, or a few kitchens. Shared by events and battles.
@Component({
  selector: 'app-invite-picker',
  imports: [FormsModule, MatButtonToggleModule, MatFormFieldModule, MatSelectModule, TranslatePipe, KitchenChipComponent],
  template: `
    <div class="who">
      <span class="label">{{ "KOL_WHO" | translate }}</span>
      <mat-button-toggle-group [value]="invited() === 'all'" (change)="invited.set($event.value ? 'all' : [])" hideSingleSelectionIndicator>
        <mat-button-toggle [value]="true">{{ "KOL_ALL_KITCHENS" | translate }}</mat-button-toggle>
        <mat-button-toggle [value]="false">{{ "KOL_SOME_KITCHENS" | translate }}</mat-button-toggle>
      </mat-button-toggle-group>
      @if (invited() !== 'all') {
        <mat-form-field>
          <mat-label>{{ "KOL_PICK_KITCHENS" | translate }}</mat-label>
          <mat-select multiple [(ngModel)]="invited">
            @for (k of others(); track k.id) {
              <mat-option [value]="k.id"><app-kitchen-chip [kitchenId]="k.id" /></mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
    </div>
  `,
  styles: DIALOG_STYLES,
})
export class InvitePickerComponent {
  private readonly kollegiet = inject(KollegietService);
  readonly invited = model.required<'all' | string[]>();
  protected readonly others = computed(() => this.kollegiet.cards().filter(c => c.id !== this.kollegiet.kitchenId));
}

const someone = (invited: 'all' | string[]) => invited === 'all' || invited.length > 0;

export interface EventDialogData {
  event: KEvent | null;
}

// A new event (open kitchen, party, dinner) or editing one. Closes with its fields.
@Component({
  selector: 'app-event-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, TranslatePipe, InvitePickerComponent],
  template: `
    <h2 mat-dialog-title>{{ (data.event ? "KOL_EVENT_EDIT" : "KOL_EVENT_NEW") | translate }}</h2>
    <form mat-dialog-content [formGroup]="form" (ngSubmit)="save()" id="event-form">
      <mat-form-field class="first">
        <mat-label>{{ "KOL_EVENT_KIND" | translate }}</mat-label>
        <mat-select formControlName="kind">
          @for (k of kinds; track k) {
            <mat-option [value]="k">{{ "KOL_EVENT_" + k | translate }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ "KOL_TITLE" | translate }}</mat-label>
        <input matInput formControlName="title" [maxlength]="titleMax" autocomplete="off">
      </mat-form-field>
      <div class="when">
        <mat-form-field>
          <mat-label>{{ "FOOD_DATE" | translate }}</mat-label>
          <input matInput [matDatepicker]="picker" [min]="today" formControlName="day" readonly (click)="picker.open()">
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ "FOOD_TIME" | translate }}</mat-label>
          <input matInput type="time" formControlName="time">
        </mat-form-field>
      </div>
      <mat-form-field>
        <mat-label>{{ "KOL_EVENT_HOURS" | translate }}</mat-label>
        <mat-select formControlName="hours">
          @for (h of hourOptions; track h) {
            <mat-option [value]="h">{{ h }} {{ "KOL_HOURS" | translate }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ "KOL_PLACE" | translate }}</mat-label>
        <input matInput formControlName="place" maxlength="80" autocomplete="off">
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ "KOL_EVENT_TEXT" | translate }}</mat-label>
        <textarea matInput formControlName="text" rows="3" maxlength="1000"></textarea>
      </mat-form-field>
      <app-invite-picker [(invited)]="invited" />
    </form>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">{{ "CANCEL" | translate }}</button>
      <button mat-flat-button type="submit" form="event-form" [disabled]="form.invalid || !someone(invited())">{{ (data.event ? "SAVE" : "KOL_INVITE") | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: DIALOG_STYLES,
})
export class EventDialogComponent {
  protected readonly data = inject<EventDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<EventDialogComponent, EventFields>>(MatDialogRef);
  protected readonly kinds = EVENT_KINDS;
  protected readonly hourOptions = [1, 2, 3, 4, 6, 8, 12, 24, 48];
  protected readonly titleMax = TITLE_MAX;
  protected readonly today = new Date(new Date().setHours(0, 0, 0, 0));
  private readonly start = this.data.event?.startsAt.toDate() ?? null;
  protected readonly form = inject(NonNullableFormBuilder).group({
    kind: [this.data.event?.kind ?? 'openKitchen'],
    title: [this.data.event?.title ?? '', [Validators.required, Validators.maxLength(TITLE_MAX)]],
    day: [this.start as Date | null, Validators.required],
    time: [this.start ? hhmm(this.start) : '21:00', Validators.required],
    hours: [this.data.event ? Math.round((this.data.event.endsAt.toMillis() - this.data.event.startsAt.toMillis()) / 3.6e6) : 4],
    place: [this.data.event?.place ?? '', Validators.maxLength(80)],
    text: [this.data.event?.text ?? '', Validators.maxLength(1000)],
  });

  protected readonly invited = signal<'all' | string[]>(this.data.event?.invited ?? 'all');
  protected readonly someone = someone;

  protected save() {
    const v = this.form.getRawValue();
    const invited = this.invited();
    if (this.form.invalid || !v.day || !someone(invited)) {
      return;
    }
    const start = atTime(v.day, v.time);
    this.ref.close({
      kind: v.kind, title: v.title.trim(), text: v.text.trim(), place: v.place.trim(), invited,
      startsAt: Timestamp.fromDate(start), endsAt: Timestamp.fromMillis(start.getTime() + v.hours * 3.6e6),
    });
  }
}

export interface BattleDialogData {
  // Challenging one kitchen from its profile.
  against: string | null;
}

// A new battle: what is counted, when, and against whom.
@Component({
  selector: 'app-battle-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, TranslatePipe, InvitePickerComponent],
  template: `
    <h2 mat-dialog-title>{{ "KOL_BATTLE_NEW" | translate }}</h2>
    <form mat-dialog-content [formGroup]="form" (ngSubmit)="save()" id="battle-form">
      <mat-form-field class="first">
        <mat-label>{{ "KOL_METRIC" | translate }}</mat-label>
        <mat-select formControlName="metric">
          @for (m of metrics; track m) {
            <mat-option [value]="m">{{ "KOL_METRIC_" + m | translate }}</mat-option>
          }
        </mat-select>
        <mat-hint>{{ "KOL_METRIC_HINT_" + form.controls.metric.value | translate }}</mat-hint>
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ "KOL_TITLE" | translate }}</mat-label>
        <input matInput formControlName="title" [maxlength]="titleMax" autocomplete="off" [placeholder]="'KOL_BATTLE_TITLE_HINT' | translate">
      </mat-form-field>
      <div class="when">
        <mat-form-field>
          <mat-label>{{ "KOL_STARTS" | translate }}</mat-label>
          <input matInput [matDatepicker]="from" [min]="today" formControlName="fromDay" readonly (click)="from.open()">
          <mat-datepicker-toggle matIconSuffix [for]="from" />
          <mat-datepicker #from />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ "FOOD_TIME" | translate }}</mat-label>
          <input matInput type="time" formControlName="fromTime">
        </mat-form-field>
      </div>
      <div class="when">
        <mat-form-field>
          <mat-label>{{ "KOL_ENDS" | translate }}</mat-label>
          <input matInput [matDatepicker]="to" [min]="form.controls.fromDay.value" formControlName="toDay" readonly (click)="to.open()">
          <mat-datepicker-toggle matIconSuffix [for]="to" />
          <mat-datepicker #to />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ "FOOD_TIME" | translate }}</mat-label>
          <input matInput type="time" formControlName="toTime">
        </mat-form-field>
      </div>
      @if (error(); as e) {
        <p class="label error">{{ e | translate }}</p>
      }
      <app-invite-picker [(invited)]="invited" />
    </form>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">{{ "CANCEL" | translate }}</button>
      <button mat-flat-button type="submit" form="battle-form" [disabled]="form.invalid || !someone(invited())">{{ "KOL_CHALLENGE" | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: DIALOG_STYLES + `.error { color: var(--mat-sys-error); margin: 0; }`,
})
export class BattleDialogComponent {
  protected readonly data = inject<BattleDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<BattleDialogComponent, BattleFields>>(MatDialogRef);
  protected readonly metrics = METRICS;
  protected readonly titleMax = TITLE_MAX;
  protected readonly today = new Date(new Date().setHours(0, 0, 0, 0));
  protected readonly error = signal('');
  // Tonight from now until two at night, the classic.
  private readonly start = new Date(Date.now() + 5 * 60e3);
  private readonly end = new Date(new Date(this.start).setHours(26, 0, 0, 0));
  protected readonly form = inject(NonNullableFormBuilder).group({
    metric: ['beer' as Metric],
    title: ['', [Validators.required, Validators.maxLength(TITLE_MAX)]],
    fromDay: [new Date(this.start.getFullYear(), this.start.getMonth(), this.start.getDate()) as Date | null, Validators.required],
    fromTime: [hhmm(this.start), Validators.required],
    toDay: [new Date(this.end.getFullYear(), this.end.getMonth(), this.end.getDate()) as Date | null, Validators.required],
    toTime: [hhmm(this.end), Validators.required],
  });

  protected readonly invited = signal<'all' | string[]>(this.data.against ? [this.data.against] : 'all');
  protected readonly someone = someone;

  protected save() {
    const v = this.form.getRawValue();
    const invited = this.invited();
    if (this.form.invalid || !v.fromDay || !v.toDay || !someone(invited)) {
      return;
    }
    const from = atTime(v.fromDay, v.fromTime), to = atTime(v.toDay, v.toTime);
    if (to <= from || to.getTime() - from.getTime() > BATTLE_MAX_DAYS * 864e5) {
      this.error.set('KOL_BATTLE_BAD_TIME');
      return;
    }
    this.ref.close({
      title: v.title.trim(), metric: v.metric, invited,
      // Starting "now" is a few minutes ahead, as the rules want.
      from: Timestamp.fromMillis(Math.max(from.getTime(), Date.now() + 60e3)), to: Timestamp.fromDate(to),
    });
  }
}

export interface BadgeResult {
  badge: Badge;
  reason: string;
}

// A badge for another kitchen, with why.
@Component({
  selector: 'app-badge-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatChipsModule, MatFormFieldModule, MatInputModule, TranslatePipe, KitchenChipComponent],
  template: `
    <h2 mat-dialog-title>{{ "KOL_BADGE_GIVE" | translate }} <app-kitchen-chip [kitchenId]="to" /></h2>
    <div mat-dialog-content class="content">
      <mat-chip-listbox [(ngModel)]="badge" [attr.aria-label]="'KOL_BADGE' | translate">
        @for (b of badges; track b) {
          <mat-chip-option [value]="b">{{ "KOL_BADGE_ICON_" + b | translate }} {{ "KOL_BADGE_" + b | translate }}</mat-chip-option>
        }
      </mat-chip-listbox>
      <mat-form-field>
        <mat-label>{{ "KOL_BADGE_REASON" | translate }}</mat-label>
        <input matInput [(ngModel)]="reason" [maxlength]="reasonMax" autocomplete="off">
        <mat-hint align="end">{{ reason().length }}/{{ reasonMax }}</mat-hint>
      </mat-form-field>
    </div>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">{{ "CANCEL" | translate }}</button>
      <button mat-flat-button [disabled]="!badge() || !reason().trim()" (click)="give()">{{ "KOL_BADGE_SEND" | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `.content { display: flex; flex-direction: column; gap: 16px; padding-top: 8px; }`,
})
export class BadgeDialogComponent {
  protected readonly to = inject<string>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<BadgeDialogComponent, BadgeResult>>(MatDialogRef);
  protected readonly badges = BADGES;
  protected readonly reasonMax = REASON_MAX;
  protected readonly badge = signal<Badge | null>(null);
  protected readonly reason = signal('');

  protected give() {
    const badge = this.badge();
    if (badge && this.reason().trim()) {
      this.ref.close({badge, reason: this.reason().trim()});
    }
  }
}

export interface PollResult {
  title: string;
  opensAt: Date;
  closesAt: Date;
}

// A vote, started by the kitchen: one a month.
@Component({
  selector: 'app-poll-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ "KOL_POLL_NEW" | translate }}</h2>
    <div mat-dialog-content class="content">
      <p class="hint">{{ "KOL_POLL_INTRO" | translate }}</p>
      <mat-form-field>
        <mat-label>{{ "KOL_POLL_TITLE" | translate }}</mat-label>
        <input matInput [(ngModel)]="title" [maxlength]="titleMax" autocomplete="off"
               [placeholder]="'KOL_POLL_TITLE_HINT' | translate">
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ "KOL_POLL_DAYS" | translate }}</mat-label>
        <mat-select [(ngModel)]="days">
          @for (d of dayOptions; track d) {
            <mat-option [value]="d">{{ d }} {{ (d === 1 ? "KOL_DAY" : "KOL_DAYS") | translate }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">{{ "CANCEL" | translate }}</button>
      <button mat-flat-button [disabled]="!title().trim()" (click)="start()">{{ "KOL_POLL_START" | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `.content { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; } .hint { margin: 0 0 8px; color: var(--mat-sys-on-surface-variant); }`,
})
export class PollDialogComponent {
  private readonly ref = inject<MatDialogRef<PollDialogComponent, PollResult>>(MatDialogRef);
  protected readonly titleMax = TITLE_MAX;
  protected readonly dayOptions = [1, 3, 7, 14, 31];
  protected readonly title = signal('');
  protected readonly days = signal(7);

  protected start() {
    const now = new Date();
    this.ref.close({title: this.title().trim(), opensAt: now, closesAt: new Date(now.getTime() + this.days() * 864e5)});
  }
}

// The kitchen's own emoji, colour and a line about it.
@Component({
  selector: 'app-profile-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ "KOL_PROFILE_EDIT" | translate }}</h2>
    <div mat-dialog-content class="content">
      <span class="label">{{ "KOL_PROFILE_EMOJI" | translate }}</span>
      <div class="pick">
        @for (e of emojis; track e) {
          <button type="button" class="swatch" [class.on]="emoji() === e" (click)="emoji.set(e)" [attr.aria-pressed]="emoji() === e">{{ e }}</button>
        }
      </div>
      <span class="label">{{ "KOL_PROFILE_COLOUR" | translate }}</span>
      <div class="pick">
        @for (c of colours; track c) {
          <button type="button" class="swatch colour" [attr.data-colour]="c" [class.on]="colour() === c" (click)="colour.set(c)"
                  [attr.aria-pressed]="colour() === c" [attr.aria-label]="c"></button>
        }
      </div>
      <mat-form-field>
        <mat-label>{{ "KOL_PROFILE_BIO" | translate }}</mat-label>
        <textarea matInput [(ngModel)]="bio" rows="3" [maxlength]="bioMax"></textarea>
        <mat-hint align="end">{{ bio().length }}/{{ bioMax }}</mat-hint>
      </mat-form-field>
    </div>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">{{ "CANCEL" | translate }}</button>
      <button mat-flat-button (click)="save()">{{ "SAVE" | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }
    .label { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
    .pick { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .swatch { width: 40px; height: 40px; border-radius: 50%; border: 2px solid transparent; font-size: 20px; cursor: pointer;
      background: var(--mat-sys-surface-container-high); color: inherit; }
    .swatch.on { border-color: var(--mat-sys-primary); }
    .colour[data-colour=purple] { background: #7e57c2; } .colour[data-colour=blue] { background: #1e88e5; }
    .colour[data-colour=teal] { background: #00897b; } .colour[data-colour=green] { background: #43a047; }
    .colour[data-colour=lime] { background: #c0ca33; } .colour[data-colour=amber] { background: #ffb300; }
    .colour[data-colour=orange] { background: #fb8c00; } .colour[data-colour=red] { background: #e53935; }
    .colour[data-colour=pink] { background: #d81b60; } .colour[data-colour=grey] { background: var(--mat-sys-outline); }
  `,
})
export class ProfileDialogComponent {
  private readonly current = inject<Pick<Profile, 'emoji' | 'colour' | 'bio'>>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ProfileDialogComponent, Pick<Profile, 'emoji' | 'colour' | 'bio'>>>(MatDialogRef);
  protected readonly emojis = KITCHEN_EMOJIS;
  protected readonly colours = KITCHEN_COLOURS;
  protected readonly bioMax = BIO_MAX;
  protected readonly emoji = signal(this.current.emoji);
  protected readonly colour = signal<KitchenColour>(this.current.colour);
  protected readonly bio = signal(this.current.bio);

  protected save() {
    this.ref.close({emoji: this.emoji(), colour: this.colour(), bio: this.bio().trim()});
  }
}
