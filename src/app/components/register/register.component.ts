import {Component, OnInit, computed, inject, input, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {NonNullableFormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {Router, RouterLink} from '@angular/router';
import {map} from 'rxjs';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {AuthService} from '../../services/auth.service';
import {AccessService} from '../../services/access.service';
import {Invite} from '../../interfaces/invite';
import {KitchenService} from '../../services/kitchen.service';
import {kitchenKey} from '../../interfaces/kitchen';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {LanguageButtonComponent} from '../language-button/language-button.component';

// The dorm's kitchens, offered as suggestions when an invite creates a new kitchen.
const DORM_KITCHENS = [
  'Gamle 1', 'Gamle 2', 'Gamle 3', 'Gamle 4', 'Gamle 5', 'Gamle 6', 'Gamle 7', 'Gamle 8',
  'Mellemste 2', 'Mellemste 3', 'Mellemste 4', 'Mellemste 5', 'Mellemste 6', 'Mellemste 7', 'Mellemste 8',
  'Ny 2', 'Ny 3', 'Ny 4', 'Ny 5', 'Ny 6', 'Ny 7', 'Ny 8',
];

// Registration is by invite only: a code from an existing kitchen (join it) or a referral
// (create a new kitchen). The code is checked before any account is created.
@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule,
    TranslatePipe, LanguageButtonComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly access = inject(AccessService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslateService);

  // ?invite=CODE from an invite link.
  readonly invite = input('');
  protected readonly form = inject(NonNullableFormBuilder).group({
    code: ['', Validators.required],
    kitchenName: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });
  protected readonly hidePassword = signal(true);
  protected readonly validInvite = signal<Invite | null>(null);
  protected readonly inviteKitchen = signal<string | null>(null);
  protected readonly inviteError = signal('');
  protected readonly submitError = signal('');
  protected readonly busy = signal(false);
  protected readonly isReferral = computed(() => !!this.validInvite() && !this.validInvite()?.kitchenId);
  // Kitchens without a login yet.
  protected readonly suggestions = toSignal(inject(KitchenService).list().pipe(map(taken => {
    const used = new Set(taken.map(k => kitchenKey(k.name)));
    return DORM_KITCHENS.filter(name => !used.has(kitchenKey(name)));
  })), {initialValue: DORM_KITCHENS});

  ngOnInit() {
    if (this.invite()) {
      this.form.patchValue({code: this.invite()});
      this.check();
    }
  }

  protected async check() {
    this.inviteError.set('');
    this.validInvite.set(null);
    const code = this.form.controls.code.value.trim();
    if (!code) {
      return;
    }
    const found = await this.access.lookup(code).catch(() => null);
    const expired = !!found && found.invite.expiresAt?.toMillis() < Date.now();
    if (!found || found.invite.usedBy || expired) {
      this.inviteError.set(this.i18n.t(!found ? 'REGISTER_INVITE_UNKNOWN' : found.invite.usedBy ? 'REGISTER_INVITE_USED' : 'REGISTER_INVITE_EXPIRED'));
      return;
    }
    this.validInvite.set(found.invite);
    this.inviteKitchen.set(found.kitchenName);
    const name = this.form.controls.kitchenName;
    name.setValidators(this.isReferral() ? [Validators.required, Validators.maxLength(40)] : []);
    name.updateValueAndValidity();
  }

  protected async submit() {
    const invite = this.validInvite();
    if (this.form.invalid || !invite || this.busy()) {
      return;
    }
    const {email, password, kitchenName} = this.form.getRawValue();
    this.busy.set(true);
    this.submitError.set('');
    try {
      await this.auth.emailSignup(email.trim(), password);
      await this.access.redeem(invite, kitchenName);
      await this.router.navigate(['']);
    } catch (e) {
      this.submitError.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
