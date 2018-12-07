import {Component, OnInit} from '@angular/core';
import {map} from 'rxjs/operators';
import {UserService} from '../core/services/user.service';
import {Observable} from 'rxjs';
import {User} from '../core/interfaces/user';
import {MatDialog} from '@angular/material';
import {EditUserDialogComponent} from './edit-user-dialog/edit-user-dialog.component';
import {AddUserDialogComponent} from './add-user-dialog/add-user-dialog.component';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html'
})
export class UsersComponent implements OnInit {
  users: User[];
  displayedColumns = ['image', 'name', 'room', 'active', 'edit', 'delete'];

  constructor(private userService: UserService, public dialog: MatDialog) {
  }

  ngOnInit() {
    this.userService.list().subscribe(data => {
      this.users = data;
    });
  }

  openEditDialog(product) {
    console.log(product);
    const dialogRef = this.dialog.open(EditUserDialogComponent, {
      width: '400px',
      height: '540px',
      data: product
    });

    dialogRef.afterClosed().subscribe(editedProduct => {
      if (!editedProduct) {
        this.userService.list().subscribe(data => {
          this.users = data;
        });
      } else {
        this.userService.update(editedProduct);
      }
    });
  }

  openAddDialog() {
    const dialogRef = this.dialog.open(AddUserDialogComponent, {
      width: '400px',
      height: '540px',
      data: {}
    });

    dialogRef.afterClosed().subscribe(newUser => {
      if (newUser) {
        this.userService.add(newUser);
      }
    });
  }
}
