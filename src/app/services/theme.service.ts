import {Injectable, effect, signal} from '@angular/core';

export type ThemeMode = 'auto' | 'light' | 'dark';
const KEY = 'kollegianeren.theme';
const MODES: ThemeMode[] = ['auto', 'light', 'dark'];

// Light, dark, or follow the device. The M3 theme is built with light-dark() colours, so setting
// color-scheme on <html> is all it takes; the choice is remembered per device.
@Injectable({providedIn: 'root'})
export class ThemeService {
  readonly mode = signal<ThemeMode>(readMode());

  constructor() {
    effect(() => {
      const mode = this.mode();
      document.documentElement.style.colorScheme = mode === 'auto' ? '' : mode;
      try {
        localStorage.setItem(KEY, mode);
      } catch {
        // Not remembered, still applied for this session.
      }
    });
  }
}

function readMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(KEY) as ThemeMode;
    return MODES.includes(saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}
