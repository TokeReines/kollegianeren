import { Component, OnInit } from '@angular/core';
import { TranslateService } from '../../services/translate.service';

@Component({
  selector: 'app-language-button',
  templateUrl: './language-button.component.html',
  styleUrls: ['./language-button.component.scss']
})
export class LanguageButtonComponent implements OnInit {
  currentLanguage: string = this.translate.getLanguage();

  constructor(private translate: TranslateService) { }

  ngOnInit() { }

  setLang() {
    if (this.currentLanguage === 'en') {
      this.currentLanguage = 'da';
    } else {
      this.currentLanguage = 'en';
    }
    this.translate.use(this.currentLanguage);
  }
}
