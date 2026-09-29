import {ChangeDetectionStrategy, Component, Inject, Optional} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {Router} from '@angular/router';

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

@Component({
  selector: 'app-reveal-dialog',
  templateUrl: './reveal-dialog.component.html',
  styleUrls: ['./reveal-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class RevealDialogComponent {
  photoFailed = false;
  hideForGood = false;

  constructor(private dialogRef: MatDialogRef<RevealDialogComponent>, private router: Router,
              @Optional() @Inject(MAT_DIALOG_DATA) public data: RevealData | null) {
    if (data?.uid) {
      remember(sessionStorage, `${SESSION_KEY}.${data.uid}`);
    }
    // However it is closed (button, backdrop, Escape), honour the checkbox.
    this.dialogRef.beforeClosed().subscribe(() => {
      if (this.hideForGood && data?.uid) {
        remember(localStorage, `${HIDE_KEY}.${data.uid}`);
      }
    });
  }

  go(path: string, fragment?: string) {
    this.dialogRef.close();
    this.router.navigate([path], {fragment});
  }

  close() {
    this.dialogRef.close();
  }
}
