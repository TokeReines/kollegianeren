import {Component, OnInit, ViewChild} from '@angular/core';
import {UserService} from '../../services/user.service';
import {User} from '../../interfaces/user';
import {MatDialog} from '@angular/material/dialog';
import {MatTableDataSource} from '@angular/material/table';
import {MatSort} from '@angular/material/sort';
import {EditUserDialogComponent} from './edit-user-dialog/edit-user-dialog.component';
import {AddUserDialogComponent} from './add-user-dialog/add-user-dialog.component';
import { deleteUser } from '@angular/fire/auth';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html'
})
export class UsersComponent implements OnInit {
  users!: MatTableDataSource<User>;
  @ViewChild(MatSort) sort!: MatSort;
  displayedColumns = ['image', 'name', 'room', 'active', 'edit', 'delete'];

  constructor(private userService: UserService, public dialog: MatDialog) {
  }

  ngOnInit() {
    this.userService.list().subscribe(data => {
      this.users = new MatTableDataSource<User>(data);
      this.users.sort = this.sort;
    });
  }

  updateUser(user: User) {
    this.userService.update(user);
  }

  deleteUser(user: User) {
    this.userService.delete(user);
  }

  openEditDialog(user: User) {
    console.log(user);
    const dialogRef = this.dialog.open(EditUserDialogComponent, {
      width: '400px',
      data: user
    });

    dialogRef.afterClosed().subscribe(editedUser => {
      if (!editedUser) {
        this.userService.list().subscribe(data => {
          this.users = new MatTableDataSource<User>(data);
          this.users.sort = this.sort;
        });
      } else {
        this.userService.update(editedUser);
      }
    });
  }

  openAddDialog() {
    const dialogRef = this.dialog.open(AddUserDialogComponent, {
      width: '400px',
      data: {}
    });

    dialogRef.afterClosed().subscribe(newUser => {
      if (newUser) {
        this.userService.add(newUser);
      }
    });
  }
}
