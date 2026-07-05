import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ThemeService } from '@core/utils/theme.service';

interface Pref {
  key: string;
  label: string;
  desc: string;
}

@Component({
  selector: 'app-settings',
  imports: [FormsModule, InputTextModule, ButtonModule, ToggleSwitchModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  private readonly theme = inject(ThemeService);

  protected nome = 'Vando Dos Reis';
  protected email = 'vandodosreis2001@gmail.com';
  protected telefone = '(11) 95860-0976';
  protected granja = 'Granja Ovo Bom';

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
