import {AbstractControl, ValidationErrors} from '@angular/forms';

// A name of only spaces is no name: Validators.required lets it through.
export function notBlank(control: AbstractControl<string | null>): ValidationErrors | null {
  const v = control.value;
  return typeof v === 'string' && v.length > 0 && !v.trim() ? {blank: true} : null;
}
