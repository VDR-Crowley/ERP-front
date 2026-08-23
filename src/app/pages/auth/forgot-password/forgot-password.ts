import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputOtpModule } from 'primeng/inputotp';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';
import { AuthApiService } from '@core/auth/auth-api.service';

@Component({
  selector: 'app-forgot-password',
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    InputOtpModule,
    PasswordModule,
    MessageModule,
  ],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword {
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);

  /** 1 = e-mail, 2 = código, 3 = nova senha */
  protected readonly step = signal(1);

  protected email = '';
  protected token = '';
  protected novaSenha = '';
  protected confirmarSenha = '';

  protected readonly enviando = signal(false);
  protected readonly erro = signal('');

  protected readonly tokenValido = computed(() => this.token.length === 6);
  protected readonly senhasConferem = computed(
    () => this.novaSenha.length >= 6 && this.novaSenha === this.confirmarSenha,
  );

  protected async enviarEmail(): Promise<void> {
    if (!this.email.trim() || this.enviando()) {
      return;
    }
    this.erro.set('');
    this.enviando.set(true);
    try {
      // A API sempre responde OK genérico aqui (não revela se o e-mail existe).
      await firstValueFrom(this.authApi.forgotPassword(this.email.trim()));
      this.step.set(2);
    } catch {
      this.erro.set('Não foi possível enviar o código. Tente novamente.');
    } finally {
      this.enviando.set(false);
    }
  }

  protected async validarToken(): Promise<void> {
    if (!this.tokenValido() || this.enviando()) {
      return;
    }
    this.erro.set('');
    this.enviando.set(true);
    try {
      await firstValueFrom(this.authApi.verifyResetCode(this.email.trim(), this.token));
      this.step.set(3);
    } catch {
      this.erro.set('Código inválido ou expirado.');
    } finally {
      this.enviando.set(false);
    }
  }

  protected async redefinir(): Promise<void> {
    if (!this.senhasConferem() || this.enviando()) {
      return;
    }
    this.erro.set('');
    this.enviando.set(true);
    try {
      await firstValueFrom(
        this.authApi.resetPassword(this.email.trim(), this.token, this.novaSenha, this.confirmarSenha),
      );
      this.router.navigate(['/login']);
    } catch {
      this.erro.set('Não foi possível redefinir a senha. Tente novamente.');
    } finally {
      this.enviando.set(false);
    }
  }

  protected voltar(): void {
    this.erro.set('');
    if (this.step() === 1) {
      this.router.navigate(['/login']);
      return;
    }
    this.step.update((s) => Math.max(1, s - 1));
  }
}
