import {Component, OnInit} from '@angular/core';
import {AuthService} from '../../services/auth.service';
import {Router} from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html'
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  hidePassword = true;

  constructor(private authService: AuthService,
              private router: Router) {
  }

  ngOnInit() {
  }

  login() {
    this.authService.emailLogin(this.email, this.password)
      .then(() => this.router.navigate(['']));
  }

}