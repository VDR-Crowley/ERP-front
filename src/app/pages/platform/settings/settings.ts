import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SkeletonModule } from 'primeng/skeleton';
import { ThemeService } from '@core/utils/theme.service';
import { AuthSession } from '@core/services/auth-session.service';

interface Pref {
  key: string;
  label: string;
  desc: string;
}

@Component({
  selector: 'app-settings',
  imports: [FormsModule, InputTextModule, ButtonModule, ToggleSwitchModule, SkeletonModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit {
  private readonly theme = inject(ThemeService);
  private readonly session = inject(AuthSession);

  /** Usuário logado (vem da API — ver AuthSession). */
  protected readonly user = this.session.user;

  protected nome = '';
  protected email = '';
  protected telefone = '';
  protected granja = '';

  protected readonly salvando = signal(false);
  protected readonly salvo = signal(false);
  protected readonly carregando = signal(true);

  ngOnInit(): void {
    this.carregarPerfil();
  }

  private carregarPerfil(): void {
    this.carregando.set(true);
    const user = this.user();
    if (user) {
      this.nome = user.name;
      this.email = user.email;
      this.telefone = user.phone ?? '';
      this.granja = user.farm ?? '';
    }
    this.carregando.set(false);
  }

  /**
   * name/email não têm endpoint de atualização na API ainda — só phone/farm
   * são persistidos (localmente, via `AuthSession.patch`, ver docstring lá).
   */
  protected salvar(): void {
    if (!this.user() || this.salvando()) return;
    this.salvo.set(false);
    this.salvando.set(true);
    this.session.patch({
      phone: this.telefone.trim(),
      farm: this.granja.trim(),
    });
    this.salvando.set(false);
    this.salvo.set(true);
  }

  protected cancelar(): void {
    this.salvo.set(false);
    this.carregarPerfil();
  }

  protected readonly prefsDefs: Pref[] = [
    { key: 'emailAlerts', label: 'Alertas por e-mail', desc: 'Receba avisos de vendas e pendências' },
    {
      key: 'lowStock',
      label: 'Aviso de estoque baixo',
      desc: 'Notificar quando ovos ou ração estiverem acabando',
    },
    { key: 'weeklyReport', label: 'Relatório semanal', desc: 'Resumo automático toda segunda-feira' },
    { key: 'darkTheme', label: 'Tema escuro', desc: 'Interface com fundo escuro' },
  ];

  protected readonly prefs = signal<Record<string, boolean>>({
    emailAlerts: true,
    lowStock: true,
    weeklyReport: false,
    darkTheme: this.theme.isDark(),
  });

  protected setPref(key: string, value: boolean): void {
    this.prefs.update((p) => ({ ...p, [key]: value }));
    if (key === 'darkTheme') {
      this.theme.setDark(value);
    }
  }
}
