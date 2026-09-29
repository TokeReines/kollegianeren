import {ChangeDetectionStrategy, Component} from '@angular/core';
import {TranslateService} from '../../services/translate.service';
import {RETENTION_MONTHS} from '../../services/residency.service';

// Plain-language privacy note, readable without logging in.
@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.component.html',
  styleUrls: ['./privacy.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class PrivacyComponent {
  retentionMonths = RETENTION_MONTHS;

  constructor(public translate: TranslateService) {
  }
}
