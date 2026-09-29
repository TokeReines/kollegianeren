import {Injectable} from '@angular/core';
import {MatSidenav} from '@angular/material/sidenav';
import {BehaviorSubject} from 'rxjs';

const RAIL_KEY = 'kollegianeren.rail.hidden';

@Injectable()
export class SidenavService {
  private sidenav: MatSidenav;
  // Tablets: the rail can be hidden, so the kitchen tablet shows only the buy page.
  readonly railHidden = new BehaviorSubject<boolean>(read());

  public setSidenav(sidenav: MatSidenav) {
    this.sidenav = sidenav;
  }

  public open() {
    return this.sidenav.open();
  }

  public close() {
    return this.sidenav.close();
  }

  // Phones: open or close the slide-over menu. Tablets: hide or show the rail.
  public toggle(): void {
    if (this.sidenav.mode === 'side') {
      const hidden = !this.railHidden.value;
      this.railHidden.next(hidden);
      try {
        localStorage.setItem(RAIL_KEY, hidden ? '1' : '0');
      } catch {
        // Not remembered; still applies until reload.
      }
    } else {
      this.sidenav.toggle();
    }
  }
}

function read(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === '1';
  } catch {
    return false;
  }
}
