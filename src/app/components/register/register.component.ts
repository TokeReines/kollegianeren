import {Component, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {UntypedFormControl, UntypedFormGroup, Validators} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import {AuthService} from '../../services/auth.service';
import {AccessService, Invite} from '../../services/access.service';
import {KitchenService} from '../../services/kitchen.service';
import {TranslateService} from '../../services/translate.service';

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
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class RegisterComponent implements OnInit {
  form: UntypedFormGroup;
  hidePassword = true;
  invite: Invite | null = null;
  inviteKitchen: string | null = null;
  inviteError = '';
  submitError = '';
  busy = false;
  suggestions: string[] = DORM_KITCHENS;

  constructor(
    private authService: AuthService,
    private access: AccessService,
    private kitchens: KitchenService,
    private translate: TranslateService,
    private route: ActivatedRoute,
    private router: Router,
  ) {
  }

  ngOnInit() {
    this.form = new UntypedFormGroup({
      code: new UntypedFormControl('', [Validators.required]),
      kitchenName: new UntypedFormControl(''),
      email: new UntypedFormControl('', [Validators.required, Validators.email]),
      password: new UntypedFormControl('', [Validators.required, Validators.minLength(6)]),
    });
    this.kitchens.list().subscribe(taken => {
      const key = (name: string) => String(name).toLowerCase().replace(/[\s.]/g, '').replace(/^gamle/, 'gl').replace(/^(mellemste|ml)/, 'm');
      const used = new Set(taken.map(k => key(k.name)));
      this.suggestions = DORM_KITCHENS.filter(name => !used.has(key(name)));
    });
    const code = this.route.snapshot.queryParamMap.get('invite');
    if (code) {
      this.form.patchValue({code});
      this.check();
    }
  }

  private t(key: string) {
    return this.translate.data[key] || key;
  }

  async check() {
    this.inviteError = '';
    this.invite = null;
    const code = String(this.form.value.code || '').trim();
    if (!code) {
      return;
    }
    const found = await this.access.lookup(code).catch(() => null);
    const expired = found && found.invite.expiresAt?.toMillis() < Date.now();
    if (!found || found.invite.usedBy || expired) {
      this.inviteError = this.t(!found ? 'REGISTER_INVITE_UNKNOWN' : found.invite.usedBy ? 'REGISTER_INVITE_USED' : 'REGISTER_INVITE_EXPIRED');
      return;
    }
    this.invite = found.invite;
    this.inviteKitchen = found.kitchenName;
    const name = this.form.get('kitchenName');
    name.setValidators(this.isReferral ? [Validators.required, Validators.maxLength(40)] : []);
    name.updateValueAndValidity();
  }

  get isReferral() {
    return !!this.invite && !this.invite.kitchenId;
  }

  async onSubmit() {
    if (this.form.invalid || !this.invite || this.busy) {
      return;
    }
    this.busy = true;
    this.submitError = '';
    try {
      await this.authService.emailSignup(this.form.value.email, this.form.value.password);
      await this.access.redeem(this.invite, this.form.value.kitchenName);
      this.router.navigate(['']);
    } catch (e) {
      this.submitError = e.message;
    } finally {
      this.busy = false;
    }
  }
}
