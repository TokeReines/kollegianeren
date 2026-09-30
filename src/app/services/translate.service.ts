import {Injectable, computed, signal} from '@angular/core';

export type Language = 'da' | 'en';
const KEY = 'kollegianeren.language';

// Danish and English texts from assets/i18n. Keys without a text show as themselves.
@Injectable({providedIn: 'root'})
export class TranslateService {
  readonly language = signal<Language>(readLanguage());
  private readonly texts = signal<Record<string, string>>({});
  // Read by the translate pipe, so templates update when the language changes.
  readonly dictionary = computed(() => this.texts());

  init(): Promise<void> {
    return this.load(this.language());
  }

  async use(language: Language): Promise<void> {
    this.language.set(language);
    try {
      localStorage.setItem(KEY, language);
    } catch {
      // Not remembered; Danish again after a reload.
    }
    await this.load(language);
  }

  t(key: string): string {
    return this.texts()[key] || key;
  }

  private async load(language: Language) {
    try {
      const res = await fetch(`assets/i18n/${language}.json`);
      this.texts.set(res.ok ? await res.json() : {});
    } catch {
      this.texts.set({});
    }
  }
}

function readLanguage(): Language {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'da';
  } catch {
    return 'da';
  }
}
