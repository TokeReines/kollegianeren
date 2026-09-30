import {Component, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Router} from '@angular/router';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {TranslatePipe} from '../../translate.pipe';

// The maker introduces himself. Shown at every login (once per browser session) until someone
// ticks "Vis ikke igen", which is remembered in this browser for that login.
const HIDE_KEY = 'kollegianeren.reveal.2026.hide';
const SESSION_KEY = 'kollegianeren.reveal.2026.shown';

export function revealWanted(uid: string): boolean {
  try {
    return localStorage.getItem(`${HIDE_KEY}.${uid}`) !== '1' && sessionStorage.getItem(`${SESSION_KEY}.${uid}`) !== '1';
  } catch {
    return false;
  }
}

function remember(storage: Storage, key: string) {
  try {
    storage.setItem(key, '1');
  } catch {
    // Private mode or blocked storage: the welcome may show again, which is harmless.
  }
}

export interface RevealData {
  // Present when shown at login; the "do not show again" choice is stored for this login.
  uid?: string;
}

// Opened at login (with the uid) and from Aktuelt (without, so no checkbox).
export function openReveal(dialog: MatDialog, data: RevealData = {}) {
  return dialog.open(RevealDialogComponent, {maxWidth: '96vw', autoFocus: false, data});
}

@Component({
  selector: 'app-reveal-dialog',
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, TranslatePipe],
  templateUrl: './reveal-dialog.component.html',
  styleUrl: './reveal-dialog.component.scss',
})
export class RevealDialogComponent {
  private readonly ref = inject(MatDialogRef<RevealDialogComponent>);
  private readonly router = inject(Router);
  protected readonly data = inject<RevealData>(MAT_DIALOG_DATA);
  protected readonly photoFailed = signal(false);
  protected readonly hideForGood = signal(false);

  constructor() {
    const uid = this.data.uid;
    if (uid) {
      remember(sessionStorage, `${SESSION_KEY}.${uid}`);
      // However it is closed (button, backdrop, Escape), honour the checkbox.
      this.ref.beforeClosed().subscribe(() => {
        if (this.hideForGood()) {
          remember(localStorage, `${HIDE_KEY}.${uid}`);
        }
      });
    }
  }

  protected go(path: string, fragment?: string) {
    this.ref.close();
    this.router.navigate([path], {fragment});
  }

  protected close() {
    this.ref.close();
  }
}
