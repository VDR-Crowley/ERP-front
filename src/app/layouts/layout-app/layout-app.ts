import { Component, inject, signal } from '@angular/core';
import { KeyValuePipe } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IndexedDbService } from '@core/idb/idb.service';
import { AuthSession } from '@core/services/auth-session.service';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { DatePicker, DateRange } from '@shared/components-ds/date-picker/date-picker';
import { MonthTabs } from '@shared/components-ds/month-tabs/month-tabs';
import { BottomSheet } from '@shared/components-ds/bottom-sheet/bottom-sheet';

interface NavItem {
  path: string;
  icon: string;
  label: string;
  sub: string;
}

type ImportState = 'idle' | 'confirm' | 'errors' | 'success';

const COLLAPSE_KEY = 'erp-nav-collapsed';

@Component({
  selector: 'app-layout-app',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, KeyValuePipe, DatePicker, MonthTabs, BottomSheet],
  templateUrl: './layout-app.html',
  styleUrl: './layout-app.scss',
})
export class LayoutApp {
  private readonly router = inject(Router);
  private readonly idb = inject(IndexedDbService);
  private readonly session = inject(AuthSession);
  protected readonly periodFilter = inject(PeriodFilterService);

  /** `null` = clique em "Limpar" no calendário — remove o filtro (mostra tudo). */
  protected onPeriodChange(range: Date | DateRange | null): void {
    if (Array.isArray(range)) {
      this.periodFilter.setRange(range);
      return;
    }
    if (range === null) {
      this.periodFilter.clear();
    }
  }

  /** Usuário logado, pra exibir no rodapé da sidebar. */
  protected readonly user = this.session.user;

  /** Só o primeiro nome, pra não estourar o rodapé da sidebar. */
  protected firstName(): string {
    return (this.user()?.name ?? 'Usuário').trim().split(/\s+/)[0];
  }

  protected sair(): void {
    this.session.clear();
    this.router.navigate(['/login']);
  }

  /** Gaveta no mobile */
  protected readonly menuOpen = signal(false);
  /** Sidebar recolhida (só ícones) no desktop */
  protected readonly collapsed = signal(this.readCollapsed());
  /** Bottom sheet de filtro/importação no mobile (<=768px) */
  protected readonly filterOpen = signal(false);

  protected readonly importState = signal<ImportState>('idle');
  protected readonly importErrors = signal<string[]>([]);
  protected readonly importSummary = signal<Record<string, number>>({});
  private pendingFile: File | null = null;

  protected readonly nav: NavItem[] = [
    {
      path: '/platform/dashboard',
      icon: 'pi-home',
      label: 'Dashboard',
      sub: 'Visão geral da produção e vendas',
    },
    {
      path: '/platform/production',
      icon: 'pi-chart-bar',
      label: 'Produção',
      sub: 'Produção diária de ovos',
    },
    {
      path: '/platform/sales',
      icon: 'pi-shopping-cart',
      label: 'Vendas',
      sub: 'Todas as vendas realizadas',
    },
    {
      path: '/platform/egg-stock',
      icon: 'pi-database',
      label: 'Estoque de Ovos',
      sub: 'Saldo diário de ovos e packs',
    },
    {
      path: '/platform/plantel',
      icon: 'pi-users',
      label: 'Plantel',
      sub: 'Codornas e galinhas em produção',
    },
    {
      path: '/platform/gestao-plantel',
      icon: 'pi-clock',
      label: 'Gestão de novo Plantel',
      sub: 'Controle de incubação e eclosão',
    },
    {
      path: '/platform/controle-racao',
      icon: 'pi-inbox',
      label: 'Controle de Ração',
      sub: 'Estoque de ração por tipo e histórico de consumo',
    },
    {
      path: '/platform/higienizacao',
      icon: 'pi-sparkles',
      label: 'Higienização do Plantel',
      sub: 'Histórico de limpezas por espécie',
    },
    {
      path: '/platform/expenses',
      icon: 'pi-receipt',
      label: 'Despesas',
      sub: 'Controle de gastos da granja',
    },
    {
      path: '/platform/cash-flow',
      icon: 'pi-wallet',
      label: 'Fluxo de Caixa',
      sub: 'Entradas e saídas financeiras',
    },
    {
      path: '/platform/reports',
      icon: 'pi-chart-line',
      label: 'Relatórios',
      sub: 'Indicadores e análises do período',
    },
    {
      path: '/platform/analise-linha-negocio',
      icon: 'pi-percentage',
      label: 'Análise por Linha de Negócio',
      sub: 'Rentabilidade: codorna x galinha, por produto',
    },
    {
      path: '/platform/products',
      icon: 'pi-box',
      label: 'Produtos',
      sub: 'Catálogo e preços',
    },
    {
      path: '/platform/users',
      icon: 'pi-user',
      label: 'Usuários',
      sub: 'Contas de acesso ao sistema',
    },
    {
      path: '/platform/settings',
      icon: 'pi-cog',
      label: 'Configurações',
      sub: 'Preferências do sistema',
    },
  ];

  /** Atalhos da tab bar fixa no mobile (<=768px): as 4 telas mais usadas. */
  protected readonly tabs: NavItem[] = this.nav.slice(0, 4);

  private isDesktop(): boolean {
    return typeof window !== 'undefined' && window.innerWidth >= 1024;
  }

  private readCollapsed(): boolean {
    if (typeof localStorage === 'undefined') {
      return false;
    }
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  }

  private current(): NavItem {
    return this.nav.find((item) => this.router.url.startsWith(item.path)) ?? this.nav[0];
  }

  protected pageTitle(): string {
    return this.current().label;
  }

  protected pageSub(): string {
    return this.current().sub;
  }

  /** Botão da topbar: recolhe no desktop, abre a gaveta no mobile. */
  protected toggleSidebar(): void {
    if (this.isDesktop()) {
      this.collapsed.update((c) => {
        const next = !c;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
        }
        return next;
      });
    } else {
      this.menuOpen.update((open) => !open);
    }
  }

  protected toggleFilter(): void {
    this.filterOpen.update((open) => !open);
  }

  protected closeFilter(): void {
    this.filterOpen.set(false);
  }

  /** Fechar via backdrop/arraste do `app-bottom-sheet` (nunca reabre por aqui). */
  protected onFilterOpenChange(open: boolean): void {
    this.filterOpen.set(open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected async exportar(): Promise<void> {
    const { exportWorkbook } = await import('@core/utils/export');
    await exportWorkbook('MiniERP', this.idb);
  }

  protected async baixarModelo(): Promise<void> {
    const { downloadImportTemplate } = await import('@core/utils/import-template');
    downloadImportTemplate('MiniERP-modelo');
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) {
      return;
    }
    this.pendingFile = file;
    this.importState.set('confirm');
  }

  protected cancelarImportacao(): void {
    this.pendingFile = null;
    this.importState.set('idle');
  }

  protected async confirmarImportacao(): Promise<void> {
    const file = this.pendingFile;
    if (!file) {
      return;
    }
    const { importWorkbookFile } = await import('@core/utils/import');
    const result = await importWorkbookFile(this.idb, file);
    this.pendingFile = null;

    if (!result.success) {
      this.importErrors.set(result.errors);
      this.importState.set('errors');
      return;
    }
    this.importSummary.set(result.summary);
    this.importState.set('success');
  }

  protected fecharErros(): void {
    this.importState.set('idle');
    this.importErrors.set([]);
  }

  protected concluirImportacao(): void {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }
}
