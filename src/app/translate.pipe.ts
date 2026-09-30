import {Pipe, PipeTransform, inject} from '@angular/core';
import {TranslateService} from './services/translate.service';

// {{ "KEY" | translate }}. Impure, so it re-reads the texts when the language changes.
@Pipe({name: 'translate', pure: false})
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(TranslateService);

  transform(key: string): string {
    return this.i18n.dictionary()[key] || key;
  }
}
