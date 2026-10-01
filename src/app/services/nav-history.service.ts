import {Injectable, inject} from '@angular/core';
import {NavigationEnd, Router} from '@angular/router';
import {filter} from 'rxjs';

// The page before this one inside the app, for the back button on full-screen pages. The
// browser's own history can start outside the app, or be empty on a TV opened on a link.
@Injectable({providedIn: 'root'})
export class NavHistory {
  private current: string | null = null;
  previous: string | null = null;

  constructor() {
    inject(Router).events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe(e => {
      this.previous = this.current;
      this.current = e.urlAfterRedirects;
    });
  }
}
