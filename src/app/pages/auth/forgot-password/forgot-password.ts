import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputOtpModule } from 'primeng/inputotp';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';

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

  /** 1 = e-mail, 2 = token, 3 = nova senha */
  protected readonly step = signal(1);

  protected email = '';
  protected token = '';
  protected novaSenha = '';
  protected confirmarSenha = '';

  protected readonly tokenValido = computed(() => this.token.length === 6);
  protected readonly senhasConferem = computed(
    () => this.novaSenha.length >= 6 && this.novaSenha === this.confirmarSenha,
  );

  protected enviarEmail(): void {
    if (!this.email.trim()) {
      return;
    }
    // TODO: chamar serviço de envio de token
    this.step.set(2);
  }

  protected validarToken(): void {
    if (!this.tokenValido()) {
      return;
    }
    // TODO: validar token no backend
    this.step.set(3);
  }

  protected redefinir(): void {
    if (!this.senhasConferem()) {
      return;
    }
    // TODO: enviar nova senha ao backend
    this.router.navigate(['/login']);
  }

  protected voltar(): void {
    if (this.step() === 1) {
      this.router.navigate(['/login']);
      return;
    }
    this.step.update((s) => Math.max(1, s - 1));
  }
}
