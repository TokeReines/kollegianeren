import {Component, Injectable, computed, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {firstValueFrom} from 'rxjs';
import {TranslatePipe} from '../../translate.pipe';

export interface ConfirmOptions {
  title: string;
  message?: string;
  // Label / value lines shown as a small table, e.g. what a resident owes.
  details?: [string, string][];
  confirm: string;
  cancel?: string;
  // Red confirm button for things that cannot be undone.
  danger?: boolean;
  // A second, quieter choice next to the confirm button (see Confirm.choose).
  alternative?: string;
}

export interface NumberOptions extends ConfirmOptions {
  // Ask for a whole number instead of a yes/no.
  number: {label: string, value: number, min?: number};
}

type Result = boolean | number | 'alternative';

// The app's replacement for window.confirm / window.prompt.
@Component({
  selector: 'app-confirm-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslatePipe],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmOptions & Partial<NumberOptions>>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ConfirmDialogComponent, Result>>(MatDialogRef);
  protected readonly value = signal<number | null>(this.data.number?.value ?? null);
  protected readonly valid = computed(() => {
    const n = this.data.number;
    const v = this.value();
    return !n || (v !== null && Number.isFinite(Number(v)) && Number(v) >= (n.min ?? -Infinity));
  });

  protected alternative() {
    this.ref.close('alternative');
  }

  protected ok() {
    if (this.valid()) {
      this.ref.close(this.data.number ? Math.round(Number(this.value())) : true);
    }
  }
}

@Injectable({providedIn: 'root'})
export class Confirm {
  private readonly dialog = inject(MatDialog);

  // Resolves true when confirmed, false when cancelled.
  async ask(options: ConfirmOptions): Promise<boolean> {
    return (await this.open(options)) === true;
  }

  // Two ways to confirm: 'confirm', 'alternative', or undefined when cancelled.
  async choose(options: ConfirmOptions & {alternative: string}): Promise<'confirm' | 'alternative' | undefined> {
    const result = await this.open(options);
    return result === true ? 'confirm' : result === 'alternative' ? 'alternative' : undefined;
  }

  // Resolves the number entered, or undefined when cancelled.
  async number(options: NumberOptions): Promise<number | undefined> {
    const result = await this.open(options);
    return typeof result === 'number' ? result : undefined;
  }

  private open(options: ConfirmOptions): Promise<Result | undefined> {
    return firstValueFrom(this.dialog.open<ConfirmDialogComponent, ConfirmOptions, Result>(ConfirmDialogComponent, {
      data: options, width: '420px', maxWidth: '94vw', autoFocus: 'first-tabbable',
    }).afterClosed());
  }
}
