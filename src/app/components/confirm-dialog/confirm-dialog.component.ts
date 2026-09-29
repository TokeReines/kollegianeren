import {ChangeDetectionStrategy, Component, Inject, Injectable} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material/dialog';
import {firstValueFrom} from 'rxjs';

export interface ConfirmOptions {
  title: string;
  message?: string;
  // Label / value lines shown as a small table, e.g. what a resident owes.
  details?: [string, string][];
  confirm: string;
  cancel?: string;
  // Red confirm button for things that cannot be undone.
  danger?: boolean;
  // Ask for a whole number instead of a yes/no.
  number?: {label: string, value: number, min?: number};
}

// The app's replacement for window.confirm / window.prompt.
@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class ConfirmDialogComponent {
  value: number;

  constructor(@Inject(MAT_DIALOG_DATA) public data: ConfirmOptions, private ref: MatDialogRef<ConfirmDialogComponent>) {
    this.value = data.number?.value;
  }

  get valid() {
    return !this.data.number || (Number.isFinite(Number(this.value)) && Number(this.value) >= (this.data.number.min ?? -Infinity));
  }

  ok() {
    if (this.valid) {
      this.ref.close(this.data.number ? Math.round(Number(this.value)) : true);
    }
  }
}

@Injectable({providedIn: 'root'})
export class Confirm {
  constructor(private dialog: MatDialog) {
  }

  // Resolves true (or the number entered) when confirmed, undefined when cancelled.
  ask(options: ConfirmOptions): Promise<any> {
    return firstValueFrom(this.dialog.open(ConfirmDialogComponent, {data: options, width: '420px', maxWidth: '94vw', autoFocus: 'first-tabbable'}).afterClosed());
  }
}
