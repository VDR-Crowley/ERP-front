import { Component, Injector, inject, signal } from '@angular/core';
import { KeyValuePipe } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthSession } from '@core/services/auth-session.service';
import { AuthApiService } from '@core/auth/auth-api.service';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { SalesQuickCreate } from '@core/services/sales-quick-create.service';
import { DatePicker, DateRange } from '@shared/components-ds/date-picker/date-picker';
import { MonthTabs } from '@shared/components-ds/month-tabs/month-tabs';
import { BottomSheet } from '@shared/components-ds/bottom-sheet/bottom-sheet';

interface NavItem {
  path: string;
  icon: string;
  label: string;
  sub: string;
}

type ImportState = 'idle' | 'confirm' | 'loading' | 'errors' | 'success';

const COLLAPSE_KEY = 'erp-nav-collapsed';

@Component({
  selector: 'app-layout-app',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, KeyValuePipe, DatePicker, MonthTabs, BottomSheet],
  templateUrl: './layout-app.html',
  styleUrl: './layout-app.scss',
})
export class LayoutApp {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly session = inject(AuthSession);
  private readonly authApi = inject(AuthApiService);
  protected readonly periodFilter = inject(PeriodFilterService);
  private readonly quickCreate = inject(SalesQuickCreate);

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

  protected async sair(): Promise<void> {
    // authApi.logout() já limpa TokenStore/AuthSession mesmo se a API falhar
    // (ver AuthApiService.logout — best-effort).
    await firstValueFrom(this.authApi.logout());
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
  protected readonly importFailed = signal<Record<string, number>>({});
  protected readonly importSkipped = signal<Record<string, number>>({});
  protected readonly importRowErrors = signal<string[]>([]);
  protected readonly importProgress = signal<{ label: string; row: number; total: number } | null>(null);
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
      path: '/platform/galpoes',
      icon: 'pi-building',
      label: 'Galpões',
      sub: 'Locais físicos (plantéis) e o que há neles',
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
      path: '/platform/vendedores',
      icon: 'pi-id-card',
      label: 'Vendedores',
      sub: 'Cadastro de vendedores/revendedores',
    },
    {
      path: '/platform/stock-transfers',
      icon: 'pi-arrow-right-arrow-left',
      label: 'Transferência de Estoque',
      sub: 'Estoque por local e transferência entre Plantel e vendedores',
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

  /**
   * Botão de destaque no topo da sidebar (atalho pedido pelo Ytallo, igual
   * ao "Nova Simulação" do Consig360): sinaliza a `SalesQuickCreate` e navega
   * pra Vendas — a própria tela reage ao sinal e abre o modal de criação já
   * existente (`Sales.openNew`), sem duplicar form.
   */
  protected novaVenda(): void {
    this.quickCreate.request();
    this.closeMenu();
    this.router.navigate(['/platform/sales']);
  }

  protected async exportar(): Promise<void> {
    const { exportWorkbook } = await import('@core/utils/export');
    await exportWorkbook('MiniERP', this.injector);
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

  /**
   * `try/catch` cobrindo o import inteiro é a raiz do bug do loop de carregamento
   * infinito: sem ele, qualquer exceção fora do tratamento por linha de
   * `import.ts` (rede/CORS, parse de planilha, timeout) rejeitava a Promise sem
   * nunca tocar `importState` — o modal ficava travado em "confirm" pra sempre,
   * sem erro visível. Agora QUALQUER falha cai no `catch` e sempre resolve pro
   * estado 'errors', nunca trava.
   */
  protected async confirmarImportacao(): Promise<void> {
    const file = this.pendingFile;
    if (!file) {
      return;
    }
    this.pendingFile = null;
    this.importState.set('loading');
    this.importProgress.set(null);
    try {
      const { importWorkbookFile } = await import('@core/utils/import');
      const result = await importWorkbookFile(this.injector, file, (progress) => this.importProgress.set(progress));

      if (!result.success) {
        this.importErrors.set(result.errors);
        this.importState.set('errors');
        return;
      }
      this.importSummary.set(result.summary);
      this.importFailed.set(result.failed);
      this.importSkipped.set(result.skipped);
      this.importRowErrors.set(result.rowErrors);
      this.importState.set('success');
    } catch (e) {
      const { describeImportError } = await import('@core/utils/import');
      this.importErrors.set([`Falha inesperada ao importar: ${describeImportError(e)}`]);
      this.importState.set('errors');
    }
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
