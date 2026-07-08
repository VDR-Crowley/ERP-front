import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { UsersService } from '@core/services/users.service';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, PasswordModule],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private readonly router = inject(Router);
  private readonly users = inject(UsersService);

  protected nome = '';
  protected email = '';
  protected senha = '';
  protected confirmarSenha = '';

  protected readonly erro = signal('');
  protected readonly salvando = signal(false);

  protected senhasConferem(): boolean {
    return this.senha.length >= 6 && this.senha === this.confirmarSenha;
  }

  protected formValido(): boolean {
    return this.nome.trim().length > 0 && this.email.trim().length > 0 && this.senhasConferem();
  }

  protected async cadastrar(): Promise<void> {
    if (!this.formValido() || this.salvando()) {
      return;
    }
    this.erro.set('');
    this.salvando.set(true);
    const result = await this.users.register({
      name: this.nome,
      email: this.email,
      password: this.senha,
    });
    this.salvando.set(false);

    if (!result.ok) {
      this.erro.set(result.error ?? 'Não foi possível cadastrar.');
      return;
    }
    this.router.navigate(['/login']);
  }
}
