import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthApiService } from '@core/auth/auth-api.service';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, PasswordModule],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);

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
    try {
      // API loga automaticamente no registro (ver openapi.yaml: /register).
      await firstValueFrom(
        this.authApi.register({
          name: this.nome.trim(),
          email: this.email.trim(),
          password: this.senha,
          password_confirmation: this.confirmarSenha,
        }),
      );
      this.router.navigate(['/platform/dashboard']);
    } catch (err) {
      this.erro.set(this.mensagemErro(err));
    } finally {
      this.salvando.set(false);
    }
  }

  private mensagemErro(err: unknown): string {
    if (err instanceof HttpErrorResponse && err.status === 422) {
      const errors = err.error?.errors as Record<string, string[]> | undefined;
      return errors?.['email']?.[0] ?? err.error?.message ?? 'Não foi possível cadastrar.';
    }
    return 'Não foi possível cadastrar. Tente novamente.';
  }
}
