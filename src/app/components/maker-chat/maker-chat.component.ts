import {ChangeDetectionStrategy, Component, OnDestroy} from '@angular/core';
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
export class MakerChatComponent implements OnDestroy {
  messages: Message[] = [];
  text = '';
  private sub: Subscription;

  constructor(private maker: MakerService, private snackBar: MatSnackBar) {
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

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}
