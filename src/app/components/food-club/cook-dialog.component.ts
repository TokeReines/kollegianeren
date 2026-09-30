import {Component, inject} from '@angular/core';
import {DatePipe} from '@angular/common';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {User} from '../../interfaces/user';
import {TranslatePipe} from '../../translate.pipe';
import {ResidentTilesComponent} from './resident-tiles.component';

export interface CookDialogData {
  day: Date;
  residents: User[];
}

// Booking a day: tap who cooks. Menu, time and the rest can be added later.
@Component({
  selector: 'app-cook-dialog',
  imports: [DatePipe, MatDialogModule, MatButtonModule, TranslatePipe, ResidentTilesComponent],
  template: `
    <h2 mat-dialog-title>{{ "FOOD_WHO_COOKS" | translate }} {{ data.day | date:'EEEE d. MMMM' }}?</h2>
    <div mat-dialog-content>
      <app-resident-tiles [residents]="data.residents" (picked)="ref.close($event)" />
    </div>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ "CANCEL" | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class CookDialogComponent {
  protected readonly data = inject<CookDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<CookDialogComponent, User>>(MatDialogRef);
}
