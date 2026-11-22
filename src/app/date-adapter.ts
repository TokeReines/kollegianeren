import {Injectable} from '@angular/core';
import {NativeDateAdapter} from '@angular/material/core';

// A typed date the Danish way: "20.11.2026", "20/11", "20-11-26". Undefined when the text is not
// in that form at all (the browser then has a go), an invalid date when it is but there is no
// such day ("31.2").
export function parseDanishDate(text: string, thisYear = new Date().getFullYear()): Date | undefined {
  const m = /^\s*(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}|\d{2}))?\s*$/.exec(text);
  if (!m) {
    return undefined;
  }
  const day = Number(m[1]), month = Number(m[2]) - 1;
  const year = m[3] === undefined ? thisYear : m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : new Date(NaN);
}

// The date pickers' fields read what people type: the browser's own parsing knows only US and ISO
// dates, so "20.11.2026" came out as nothing and the field quietly kept the old date.
@Injectable()
export class DanishDateAdapter extends NativeDateAdapter {
  override parse(value: unknown, parseFormat?: unknown): Date | null {
    const date = typeof value === 'string' ? parseDanishDate(value) : undefined;
    return date ?? super.parse(value, parseFormat);
  }
}
