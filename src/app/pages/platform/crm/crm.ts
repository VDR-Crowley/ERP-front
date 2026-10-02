import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Customer } from '@core/interfaces/customer.interface';
import { Venda } from '@core/interfaces/venda.interface';
import { createCustomersStore } from '@core/api/adapters/customers.adapter';
import { createSalesStore } from '@core/api/adapters/sales.adapter';
import { AuthSession } from '@core/services/auth-session.service';
import { brl, num, ptDate } from '@core/utils/format';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

/** Uma compra no histórico do cliente (accordion). */
interface CompraHistorico {
  date: string;
  product: string;
  quantity: number;
  total: number;
  seller: string;
}

/** Linha do CRM: um cliente com o resumo agregado das vendas dele (por nome). */
interface CrmRow {
  id: string;
  name: string;
  phone: string;
  /** Vendedor da última compra — pra direcionar o contato ao vendedor certo. */
  vendedor: string;
  ultimaCompra: string | null;
  /** Dias desde a última compra. `Infinity` = nunca comprou (vai pro topo). */
  diasSemComprar: number;
  compras: number;
  total: number;
  historico: CompraHistorico[];
}

function diasEntre(isoDate: string): number {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.floor((hoje.getTime() - d.getTime()) / 86_400_000);
}

@Component({
  selector: 'app-crm',
  imports: [FormsModule, CrudFormModal, ConfirmModal, SortIcon],
  templateUrl: './crm.html',
  styleUrl: './crm.scss',
})
export class Crm {
  protected readonly brl = brl;
  protected readonly num = num;
  protected readonly ptDate = ptDate;

  private readonly store = createCustomersStore();
  private readonly salesStore = createSalesStore();
  private readonly session = inject(AuthSession);

  /** VENDEDOR: esconde o accordion de itens detalhados (mantém nº compras e total). */
  protected readonly isVendedor = this.session.isVendedor;

  /** Vendas agrupadas por comprador (nome) — só pro accordion (histórico detalhado). */
  private readonly vendasPorCliente = computed(() => {
    const mapa = new Map<string, Venda[]>();
    for (const v of this.salesStore.items()) {
      const nome = (v.buyer ?? '').trim();
      if (!nome) continue;
      const lista = mapa.get(nome) ?? [];
      lista.push(v);
      mapa.set(nome, lista);
    }
    return mapa;
  });

  /** Uma linha por cliente, com o resumo agregado das vendas. */
  protected readonly linhas = computed<CrmRow[]>(() => {
    const porCliente = this.vendasPorCliente();
    return this.store.items().map((c) => {
      const vendas = [...(porCliente.get(c.name) ?? [])].sort((a, b) => b.date.localeCompare(a.date));
      // Colunas vêm dos AGREGADOS do backend (histórico completo, mesmo pro
      // vendedor cujo /sales é escopado em mês/não-pagas) — evita o falso
      // "nunca". O accordion (historico) usa o /sales carregado.
      const ultima = c.lastPurchase ?? vendas[0]?.date ?? null;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        vendedor: c.lastSeller ?? vendas[0]?.seller ?? '',
        ultimaCompra: ultima,
        diasSemComprar: ultima ? diasEntre(ultima) : Infinity,
        compras: c.purchaseCount ?? vendas.length,
        total: c.total ?? vendas.reduce((s, v) => s + v.total, 0),
        historico: vendas.map((v) => ({
          date: v.date,
          product: v.product,
          quantity: v.quantity,
          total: v.total,
          seller: v.seller ?? '',
        })),
      };
    });
  });

  protected readonly search = signal('');
  protected readonly searchKeys: (keyof CrmRow)[] = ['name', 'phone', 'vendedor'];
  // Começa por quem está há mais tempo sem comprar (dias sem comprar ↓; quem
  // nunca comprou = Infinity, vai pro topo).
  private readonly sortState = createSortState<keyof CrmRow>('diasSemComprar', -1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly rows = computed<CrmRow[]>(() =>
    sortRows(this.linhas(), this.sortField(), this.sortDir()),
  );

  // Mesma instância do FilterByPipe da tabela — o "Copiar visíveis" precisa da
  // MESMA lista filtrada que está na tela (não de todos os clientes).
  private readonly filterPipe = new FilterByPipe();
  protected readonly filtradas = computed<CrmRow[]>(() =>
    this.filterPipe.transform(this.rows(), this.search(), this.searchKeys),
  );

  protected readonly totalClientes = computed(() => this.linhas().length);
  protected readonly semTelefone = computed(() => this.linhas().filter((l) => !l.phone).length);
  protected readonly semComprar30 = computed(
    () => this.linhas().filter((l) => l.diasSemComprar >= 30).length,
  );

  /** Linhas expandidas (accordion do histórico), por nome. */
  private readonly expandidas = signal<Set<string>>(new Set());
  protected isExpandida(name: string): boolean {
    return this.expandidas().has(name);
  }

  /** `true` quando o cliente nunca comprou (diasSemComprar = Infinity). */
  protected nuncaComprou(dias: number): boolean {
    return !Number.isFinite(dias);
  }
  protected toggleExpandir(name: string): void {
    this.expandidas.update((set) => {
      const novo = new Set(set);
      if (novo.has(name)) novo.delete(name);
      else novo.add(name);
      return novo;
    });
  }

  // --- Editar telefone (CRUD) ---
  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Editar cliente');
  // VENDEDOR só edita o telefone (o nome é fixo — identifica o cliente e liga ao
  // histórico de vendas). Admin edita nome + telefone.
  protected readonly fields = computed<CrudField[]>(() =>
    this.session.isVendedor()
      ? [{ key: 'phone', label: 'Telefone', type: 'text' }]
      : [
          { key: 'name', label: 'Nome', type: 'text', required: true },
          { key: 'phone', label: 'Telefone', type: 'text' },
        ],
  );
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<CrmRow | null>(null);

  protected openNew(): void {
    this.editingId = null;
    this.formTitle.set('Novo cliente');
    this.draft = { name: '', phone: '' };
    this.formOpen.set(true);
  }

  protected openEdit(row: CrmRow): void {
    this.editingId = row.id;
    // Nome no título (o campo "Nome" some pro vendedor) — pra saber de quem é.
    this.formTitle.set(`Editar cliente — ${row.name}`);
    this.draft = { name: row.name, phone: row.phone };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const record: Customer = {
      name: String(this.draft['name'] ?? '').trim(),
      phone: String(this.draft['phone'] ?? '').trim(),
    };
    if (!record.name) return;
    if (this.editingId) await this.store.update(this.editingId, record);
    else await this.store.add(record);
    this.formOpen.set(false);
  }

  protected askDelete(row: CrmRow): void {
    this.deleteTarget.set(row);
  }
  protected cancelDelete(): void {
    this.deleteTarget.set(null);
  }
  protected async confirmDelete(): Promise<void> {
    const t = this.deleteTarget();
    if (!t) return;
    await this.store.remove(t.id);
    this.deleteTarget.set(null);
  }

  // --- Copiar (WhatsApp) ---
  protected readonly copiado = signal<string | null>(null);

  /** Texto de UM cliente pro WhatsApp: nome, telefone, dias sem comprar, histórico. */
  private textoDoCliente(row: CrmRow): string {
    const linhas: string[] = [];
    linhas.push(`Cliente: ${row.name}`);
    linhas.push(`Telefone: ${row.phone || '—'}`);
    if (row.vendedor) linhas.push(`Vendedor: ${row.vendedor}`);
    if (row.ultimaCompra) {
      linhas.push(`Última compra: ${ptDate(row.ultimaCompra)} (${row.diasSemComprar} dias sem comprar)`);
    } else {
      linhas.push('Última compra: nunca comprou');
    }
    // VENDEDOR não vê a lista de itens — só o resumo (nº compras + total).
    if (!this.session.isVendedor() && row.historico.length) {
      linhas.push('Histórico:');
      for (const h of row.historico) {
        const vend = h.seller ? ` [${h.seller}]` : '';
        linhas.push(`- ${ptDate(h.date)}: ${num(h.quantity)}x ${h.product} = ${brl(h.total)}${vend}`);
      }
    }
    if (row.compras > 0) {
      linhas.push(`Total: ${brl(row.total)} em ${row.compras} compra(s)`);
    }
    return linhas.join('\n');
  }

  private async copiar(texto: string, chave: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.copiado.set(chave);
      setTimeout(() => this.copiado.set(null), 2000);
    } catch {
      this.copiado.set(null);
    }
  }

  protected copiarCliente(row: CrmRow): void {
    void this.copiar(this.textoDoCliente(row), row.name);
  }

  /**
   * Copia só o que está VISÍVEL na tela (respeita a busca/filtro e a ordem
   * atual). Assim dá pra filtrar por vendedor na busca e copiar só os dele.
   */
  protected copiarVisiveis(): void {
    const texto = this.filtradas()
      .map((r) => this.textoDoCliente(r))
      .join('\n\n———\n\n');
    void this.copiar(texto, '__all__');
  }

  /** Link wa.me pro telefone (só dígitos) — abre o WhatsApp já no cliente. */
  protected whatsappLink(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}` : '';
  }
}
