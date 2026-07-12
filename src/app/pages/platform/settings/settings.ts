import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SkeletonModule } from 'primeng/skeleton';
import { firstValueFrom } from 'rxjs';
import { ThemeService } from '@core/utils/theme.service';
import { AuthSession } from '@core/services/auth-session.service';
import { IndexedDbService } from '@core/idb/idb.service';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { User } from '@core/interfaces/user.interface';

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
  private readonly idb = inject(IndexedDbService);

  /** Usuário logado (lido do localStorage via AuthSession). */
  protected readonly user = this.session.user;

  protected nome = '';
  protected email = '';
  protected telefone = '';
  protected granja = '';

  protected readonly salvando = signal(false);
  protected readonly salvo = signal(false);
  /** Enquanto true, mostra skeleton no lugar dos campos (evita "—"/vazio piscando). */
  protected readonly carregando = signal(true);

  ngOnInit(): void {
    this.carregarPerfil();
  }

  private async carregarPerfil(): Promise<void> {
    this.carregando.set(true);
    try {
      const cached = this.user();
      if (!cached) return;

      // Fonte autoritativa: relê o registro do IDB pelo uuid (localStorage pode
      // estar de uma sessão antiga/incompleta). Cai pro cache se o IDB falhar.
      let user = cached;
      try {
        const fresh = await firstValueFrom(
          this.idb.get<User & { id: string }>(IDB_STORES.users, cached.id),
        );
        if (fresh) {
          user = fresh;
          if (fresh.email !== cached.email || fresh.name !== cached.name) {
            this.session.setCurrent(fresh);
          }
        }
      } catch {
        // IDB indisponível (SSR) — usa o cache do localStorage.
      }

      this.nome = user.name;
      this.email = user.email;
      this.telefone = user.phone ?? '';
      this.granja = user.farm ?? '';
    } finally {
      this.carregando.set(false);
    }
  }

  protected async salvar(): Promise<void> {
    if (!this.user() || this.salvando()) return;
    this.salvo.set(false);
    this.salvando.set(true);
    await this.session.patch({
      name: this.nome.trim(),
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
