import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '@core/auth/auth-api.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);

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
    try {
      await firstValueFrom(this.authApi.login(this.email.trim(), this.password, this.remember));
      this.router.navigate(['/platform/dashboard']);
    } catch (err) {
      this.erro.set(this.mensagemErro(err));
    } finally {
      this.entrando.set(false);
    }
  }

  private mensagemErro(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 422) {
        return err.error?.message ?? 'E-mail ou senha inválidos.';
      }
      if (err.status === 429) {
        return 'Muitas tentativas. Aguarde um instante e tente novamente.';
      }
    }
    return 'Não foi possível entrar. Tente novamente.';
  }
}
