import {Component, inject} from '@angular/core';
import {RouterLink} from '@angular/router';
import {MatButtonModule} from '@angular/material/button';
import {RETENTION_MONTHS} from '../../services/residency';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';

// Plain-language privacy note, readable without logging in.
@Component({
  selector: 'app-privacy',
  imports: [RouterLink, MatButtonModule, TranslatePipe],
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.scss',
})
export class PrivacyComponent {
  protected readonly i18n = inject(TranslateService);
  protected readonly retentionMonths = RETENTION_MONTHS;
}
