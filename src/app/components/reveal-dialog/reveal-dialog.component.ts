import {ChangeDetectionStrategy, Component} from '@angular/core';
import {MatDialogRef} from '@angular/material/dialog';
import {Router} from '@angular/router';

// Shown once per device after the big upgrade: the maker introduces himself.
export const REVEAL_SEEN_KEY = 'kollegianeren.reveal.2026';

export function revealSeen(): boolean {
  try {
    return localStorage.getItem(REVEAL_SEEN_KEY) === '1';
  } catch {
    return true;
  }
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

  constructor(private dialogRef: MatDialogRef<RevealDialogComponent>, private router: Router) {
    try {
      localStorage.setItem(REVEAL_SEEN_KEY, '1');
    } catch {
      // Private mode or blocked storage: the reveal may show again, which is harmless.
    }
  }

  go(path: string) {
    this.dialogRef.close();
    this.router.navigate([path]);
  }

  close() {
    this.dialogRef.close();
  }
}
