import {Component, inject} from '@angular/core';
import {RouterLink} from '@angular/router';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {TranslatePipe} from '../../translate.pipe';
import {openReveal} from '../reveal-dialog/reveal-dialog.component';

// Coffee for the maker (#87): Toke's MobilePay Box. The link opens MobilePay on the box; the
// number is shown too, for searching in the app.
const MOBILEPAY = {box: '1041TA', url: 'https://qr.mobilepay.dk/box/d534dd5a-21a4-41a7-89dd-fba68884b6a6/pay-in'};
const REPO = 'https://github.com/TokeReines/kollegianeren';

// What it says has to stay true: where the data is (Firebase, location nam5 in the USA; pictures
// at Cloudinary), the nightly backup (ops/backup.js), the free plan's limits, who can see what
// (firestore.rules), and what happens if the maker stops or cannot be trusted. Change it with them.
const SECTIONS = ['WHO', 'OPEN', 'DATA', 'SEES', 'COST', 'MAINTAIN', 'STOP', 'HACKED', 'EVIL', 'FUTURE'] as const;

// "Om": the questions a kitchen should be able to ask about the app it keeps its money in.
@Component({
  selector: 'app-about',
  imports: [RouterLink, MatButtonModule, MatIconModule, TranslatePipe],
  template: `
    <div class="about">
      @for (s of sections; track s) {
        <section [id]="'about-' + s.toLowerCase()">
          <h2>{{ "ABOUT_" + s + "_TITLE" | translate }}</h2>
          <p>{{ "ABOUT_" + s + "_BODY" | translate }}</p>
          @if (s === 'OPEN') {
            <a mat-stroked-button [href]="repo" target="_blank" rel="noopener"><mat-icon>code</mat-icon> {{ "ABOUT_GITHUB" | translate }}</a>
          } @else if (s === 'FUTURE') {
            <a mat-stroked-button routerLink="/aktuelt" [queryParams]="{tab: 'forslag'}"><mat-icon>lightbulb</mat-icon> {{ "AKTUELT_TAB_FORSLAG" | translate }}</a>
          }
        </section>
      }
      <div class="links">
        <button mat-button (click)="showReveal()"><mat-icon>auto_awesome</mat-icon> {{ "AKTUELT_SHOW_REVEAL" | translate }}</button>
        <a mat-button routerLink="/privacy"><mat-icon>privacy_tip</mat-icon> {{ "PRIVACY" | translate }}</a>
        <a mat-stroked-button [href]="mobilePay.url" target="_blank" rel="noopener">
          <mat-icon>local_cafe</mat-icon> {{ "AKTUELT_COFFEE" | translate }} (MobilePay Box {{ mobilePay.box }})
        </a>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; padding-top: 16px; }
    .about { display: flex; flex-direction: column; gap: 8px; max-width: 760px; }
    section { padding: 12px 0 16px; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    h2 { margin: 0 0 6px; font: var(--mat-sys-title-medium); }
    p { margin: 0 0 8px; white-space: pre-line; line-height: 1.55; }
    .links { display: flex; flex-wrap: wrap; gap: 12px; padding-top: 16px; }
  `,
})
export class AboutComponent {
  private readonly dialog = inject(MatDialog);
  protected readonly sections = SECTIONS;
  protected readonly repo = REPO;
  protected readonly mobilePay = MOBILEPAY;

  protected showReveal() {
    openReveal(this.dialog);
  }
}
