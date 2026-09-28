import {Component, OnInit} from '@angular/core';
import {UntypedFormControl, UntypedFormGroup, Validators} from '@angular/forms';
import {AuthService} from '../../services/auth.service';
import {Router} from '@angular/router';
import {Registration} from '../../models/registration';
import {KitchenService} from '../../services/kitchen.service';
import {Kitchen} from '../../interfaces/kitchen';

export interface KitchenSelect {
  value: string;
  viewValue: string;
}

@Component({
    selector: 'app-register',
    templateUrl: './register.component.html',
    standalone: false
})
export class RegisterComponent implements OnInit {
  registration: Registration = new Registration();
  form: UntypedFormGroup;
  hidePassword = true;
  kitchens: KitchenSelect[] = [
    {value: 'gl8', viewValue: 'Gamle 8.'},
    {value: 'gl7', viewValue: 'Gamle 7.'},
    {value: 'gl6', viewValue: 'Gamle 6.'},
    {value: 'gl5', viewValue: 'Gamle 5.'},
    {value: 'gl4', viewValue: 'Gamle 4.'},
    {value: 'gl3', viewValue: 'Gamle 3.'},
    {value: 'gl2', viewValue: 'Gamle 2.'},
    {value: 'gl1', viewValue: 'Gamle 1.'},
    {value: 'm8', viewValue: 'Mellemste 8.'},
    {value: 'm7', viewValue: 'Mellemste 7.'},
    {value: 'm6', viewValue: 'Mellemste 6.'},
    {value: 'm5', viewValue: 'Mellemste 5.'},
    {value: 'm4', viewValue: 'Mellemste 4.'},
    {value: 'm3', viewValue: 'Mellemste 3.'},
    {value: 'm2', viewValue: 'Mellemste 2.'},
    {value: 'ny8', viewValue: 'Ny 8.'},
    {value: 'ny7', viewValue: 'Ny 7.'},
    {value: 'ny6', viewValue: 'Ny 6.'},
    {value: 'ny5', viewValue: 'Ny 5.'},
    {value: 'ny4', viewValue: 'Ny 4.'},
    {value: 'ny3', viewValue: 'Ny 3.'},
    {value: 'ny2', viewValue: 'Ny 2.'}
  ];

  constructor(
    private authService: AuthService,
    private router: Router,
    private kitchenService: KitchenService
  ) {
  }

  ngOnInit() {
    this.form = new UntypedFormGroup({
      email: new UntypedFormControl('', [Validators.required, Validators.email]),
      kitchen: new UntypedFormControl('', [Validators.required]),
      password: new UntypedFormControl('', [Validators.required, Validators.minLength(6)]),
    });
    this.kitchenService.list().subscribe(kitchens => {
      // Registered names vary in case and prefix (Gl4, gl4, Ml8, m8). A miss must not remove anything:
      // splice(-1, 1) used to drop the last option instead.
      const key = (name: string) => String(name).toLowerCase().replace(/^ml/, 'm');
      const taken = new Set(kitchens.map(k => key(k.name)));
      this.kitchens = this.kitchens.filter(k => !taken.has(key(k.value)));
    });
  }

  get f() {
    return this.form.controls;
  }

  onSubmit(registration) {
    if (this.form.invalid) {
      return;
    }

    this.authService.emailSignup(registration.email, registration.password)
      .then(res => {
        console.log(res);
        console.log(registration);
        const user = res.user;
        const kitchen = <Kitchen>{
          id: user.uid,
          name: registration.kitchen
        };
        console.log(kitchen);
        this.kitchenService.set(kitchen);
        this.router.navigate(['']);
      }, err => {

      });
  }
}
