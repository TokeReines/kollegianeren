import {Injectable} from '@angular/core';

export type ThemeMode = 'auto' | 'light' | 'dark';
const KEY = 'kollegianeren.theme';
const ORDER: ThemeMode[] = ['auto', 'light', 'dark'];

// Light, dark, or follow the device. The M3 theme is built with light-dark() colours, so setting
// color-scheme on <html> is all it takes; the choice is remembered per device.
@Injectable({providedIn: 'root'})
export class ThemeService {
  mode: ThemeMode = 'auto';

  constructor() {
    try {
      const saved = localStorage.getItem(KEY) as ThemeMode;
      if (ORDER.includes(saved)) {
        this.mode = saved;
      }
    } catch {
      // Storage unavailable: stay on auto.
    }
    this.apply();
  }

  cycle() {
    this.set(ORDER[(ORDER.indexOf(this.mode) + 1) % ORDER.length]);
  }

  set(mode: ThemeMode) {
    this.mode = mode;
    try {
      localStorage.setItem(KEY, this.mode);
    } catch {
      // Not remembered, still applied for this session.
    }
    this.apply();
  }

  get icon() {
    return {auto: 'brightness_auto', light: 'light_mode', dark: 'dark_mode'}[this.mode];
  }

  private apply() {
    document.documentElement.style.colorScheme = this.mode === 'auto' ? '' : this.mode;
  }
}
