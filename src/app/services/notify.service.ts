import {Injectable, inject} from '@angular/core';
import {MatSnackBar} from '@angular/material/snack-bar';
import {Observable} from 'rxjs';
import {TranslateService} from './translate.service';

// Snackbar messages: errors, confirmations, and copying links to the clipboard.
@Injectable({providedIn: 'root'})
export class Notify {
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(TranslateService);

  // Usable directly as a promise rejection handler: `.catch(this.notify.error)`.
  readonly error = (e: unknown): void => {
    this.snackBar.open(e instanceof Error ? e.message : String(e), 'OK', {duration: 6000});
  };

  info(message: string, duration = 4000): void {
    this.snackBar.open(message, undefined, {duration});
  }

  // A message with a button; emits when it is pressed.
  action(message: string, action: string, duration: number): Observable<void> {
    return this.snackBar.open(message, action, {duration}).onAction();
  }

  // Copies text; if the browser does not allow it, shows the text so it can be copied by hand.
  // An optional button on the confirmation, e.g. to make a new link.
  async copy(text: string, copiedMessage = this.i18n.t('ACCESS_COPIED'), then?: {label: string, run: () => void}): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      if (then) {
        this.action(copiedMessage, then.label, 8000).subscribe(then.run);
      } else {
        this.info(copiedMessage, 3000);
      }
      return true;
    } catch {
      this.snackBar.open(text, 'OK', {duration: 20000});
      return false;
    }
  }
}
