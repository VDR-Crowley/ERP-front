import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, PasswordModule],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private readonly router = inject(Router);

  protected nome = '';
  protected email = '';
  protected senha = '';
  protected confirmarSenha = '';

  protected readonly senhasConferem = computed(
    () => this.senha.length >= 6 && this.senha === this.confirmarSenha,
  );
  protected readonly formValido = computed(
    () => this.nome.trim().length > 0 && this.email.trim().length > 0 && this.senhasConferem(),
  );

  protected cadastrar(): void {
    if (!this.formValido()) {
      return;
    }
    // TODO: chamar serviço de cadastro de usuário
    this.router.navigate(['/login']);
  }
}
