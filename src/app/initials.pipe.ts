import {Pipe, PipeTransform} from '@angular/core';

// "Anna Hansen" -> "AH", "Beboer 230" -> "B2". For residents without a photo.
@Pipe({name: 'initials', standalone: false})
export class InitialsPipe implements PipeTransform {
  transform(name: string): string {
    const parts = String(name || '?').trim().split(/\s+/);
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
}

// A stable colour tone (0-2) per name, so the same resident always gets the same colour.
@Pipe({name: 'tone', standalone: false})
export class TonePipe implements PipeTransform {
  transform(name: string): number {
    let h = 0;
    for (const c of String(name || '')) {
      h = (h * 31 + c.charCodeAt(0)) >>> 0;
    }
    return h % 3;
  }
}
