import {Component, inject} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {TranslateService} from '../../services/translate.service';
import {UsageService} from '../../services/usage.service';

// DA/EN switch in the corner of the pages shown before login.
@Component({
  selector: 'app-language-button',
  imports: [MatButtonModule],
  template: `
    <button mat-button (click)="toggle()" [attr.aria-label]="i18n.language() === 'da' ? 'English' : 'Dansk'">
      {{ i18n.language() === 'da' ? 'EN' : 'DA' }}
    </button>
  `,
  styles: `:host { position: absolute; top: 12px; right: 12px; }`,
})
export class LanguageButtonComponent {
  private readonly usage = inject(UsageService);
  protected readonly i18n = inject(TranslateService);

  protected toggle() {
    this.i18n.use(this.i18n.language() === 'da' ? 'en' : 'da');
    this.usage.act('language');
  }
}
