import {AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {MatSnackBar} from '@angular/material/snack-bar';
import {Subscription} from 'rxjs';
import {Message, MakerService} from '../../services/maker.service';

// The kitchen's side of "Message your maker": one thread per kitchen.
@Component({
  selector: 'app-maker-chat',
  templateUrl: './maker-chat.component.html',
  styleUrls: ['./maker-chat.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class MakerChatComponent implements AfterViewInit, OnDestroy {
  // Shown inside Aktuelt rather than as its own page.
  @Input() embedded = false;
  @ViewChild('composer') composer: ElementRef<HTMLTextAreaElement>;
  messages: Message[] = [];
  text = '';
  private sub: Subscription;

  constructor(private maker: MakerService, private snackBar: MatSnackBar, private route: ActivatedRoute) {
    this.sub = this.maker.thread().subscribe(messages => {
      this.messages = messages;
      this.maker.markSeenByKitchen(messages);
    });
  }

  send() {
    const text = this.text.trim();
    this.text = '';
    this.maker.send(text).catch(err => {
      this.text = text;
      this.snackBar.open(err.message, 'OK', {duration: 6000});
    });
  }

  ngAfterViewInit() {
    if (this.route.snapshot.fragment === 'chat') {
      setTimeout(() => {
        this.composer?.nativeElement.closest('section, .page')?.scrollIntoView({behavior: 'smooth'});
        this.composer?.nativeElement.focus();
      });
    }
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}
