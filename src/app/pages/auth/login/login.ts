import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly router = inject(Router);

  protected email = 'admin@minierp.com';
  protected password = '123456';
  protected remember = true;

  protected onSubmit(): void {
    this.router.navigate(['/platform/dashboard']);
  }
}
