import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { UsersService } from '@core/services/users.service';
import { AuthSession } from '@core/services/auth-session.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly router = inject(Router);
  private readonly users = inject(UsersService);
  private readonly session = inject(AuthSession);

  protected email = '';
  protected password = '';
  protected remember = true;

  protected readonly erro = signal('');
  protected readonly entrando = signal(false);
  protected readonly mostrarSenha = signal(false);

  protected toggleSenha(): void {
    this.mostrarSenha.update((v) => !v);
  }

  protected async onSubmit(): Promise<void> {
    if (this.entrando()) {
      return;
    }
    this.erro.set('');
    this.entrando.set(true);
    const user = await this.users.validate(this.email, this.password);
    this.entrando.set(false);

    if (!user) {
      this.erro.set('E-mail ou senha inválidos.');
      return;
    }
    this.session.setCurrent(user);
    this.router.navigate(['/platform/dashboard']);
  }
}
