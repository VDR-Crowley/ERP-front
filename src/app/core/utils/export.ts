import * as XLSX from 'xlsx';
import { HttpClient } from '@angular/common/http';
import { Injector, inject, runInInjectionContext } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Species } from '@core/interfaces/novo-lote-plantel.interface';
import { FlockCleaning } from '@core/interfaces/flock-cleaning.interface';
import { DashboardResumo } from '@core/interfaces/dashboard.interface';
import { ptDate } from '@core/utils/format';
import { decimalToNullableNumber, decimalToNumber } from '@core/api/entity-store';
import { IndexedDbService } from '@core/idb/idb.service';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { environment } from '../../../environments/environment';

const DASHBOARD_VAZIO: DashboardResumo = {
  totalQuails: 0,
  totalChickens: 0,
  dailyQuailProduction: 0,
  dailyChickenProduction: 0,
  quailPack50Price: 0,
  chickenPack30Price: 0,
};

// Shapes crus da API — só os campos usados aqui pro export. Ver `core/api/adapters/*` pro
// shape completo/`toFront` de cada entidade (fonte da verdade, não duplicada aqui de propósito
// pra não acoplar export.ts a implementação interna dos adapters).
interface ProductApi { id: number; name: string; unit: string; unit_price: string; stock: number; eggs_per_unit: number }
interface VendedorApi { id: number; name: string; contact: string | null; active: boolean }
interface SaleApi {
  id: number; date: string; product_id: number; quantity: number; unit_price: string; total: string;
  payment_pending: boolean; buyer: string; seller_id: number; delivery_pending: boolean; delivery_date: string | null;
}
interface DailyProductionApi { id: number; date: string; quail_eggs: number | null; chicken_eggs: number | null; barn_id: number | null }
interface BarnApi { id: number; name: string; location: string | null; start_date: string | null; notes: string | null }
interface FlockApi { id: number; species: string; quantity: number; feed_bags_per_month: number; bag_price: string; monthly_total: string; barn_id: number | null }
interface BarnStockApi { barn_id: number; product_id: number; quantity: number }
interface VendorStockApi { product_id: number; vendedor_id: number; quantity: number }
interface ExpenseApi {
  id: number; date: string; description: string; category: string;
  quantity: number | null; unit_price: string | null; amount: string; paid: boolean;
}
interface CashFlowApi { id: number; date: string; description: string; inflow: boolean; amount: string }
interface UserApi { id: number; name: string; email: string; is_active: boolean }
interface HatchEventApi { id: number; date: string; count: number; notes: string | null }
interface FlockIncubationApi {
  id: number; start_date: string; species: 'quail' | 'chicken'; egg_count: number; expected_hatch_date: string;
  status: 'incubando' | 'eclodido'; egg_cost: string | null; feed_cost: string | null; notes: string | null;
  hatch_events: HatchEventApi[];
}
interface FeedStockApi { id: number; type: string; bags_in_stock: number; kg_in_stock: string; last_bag_weight_kg: string; expiration_date: string | null }
interface FeedOpenLogApi { id: number; feed_type: string; date: string; weight_kg: string }
interface FlockCleaningApi { id: number; date: string; species: 'quail' | 'chicken'; cleaning_type: FlockCleaning['cleaningType']; notes: string | null }

const speciesLabel = (s: Species) => (s === 'quail' ? 'Codorna' : 'Galinha');

/**
 * Consolida o histórico incremental (`hatch_events[]`, ver `hatch-tracking.util.ts`) no par
 * legado "Data Eclosão"/"Qtd. Nascida" que a planilha usa (o formato de 1 linha por lote não
 * tem onde guardar vários eventos) — soma as quantidades e usa a data mais recente. Lote com
 * 2+ eventos incrementais perde a granularidade dia-a-dia ao reimportar (`migrateLegacyHatchEvents`
 * recria só 1 evento consolidado), mas total nascido e status (`eclodido` quando atinge
 * `eggCount`) continuam corretos — é uma perda assumida do formato, não um bug.
 */
function consolidateHatchEvents(events: HatchEventApi[]): { date: string; count: number } | null {
  if (events.length === 0) return null;
  const count = events.reduce((sum, e) => sum + e.count, 0);
  const date = events.reduce((latest, e) => (e.date > latest ? e.date : latest), events[0].date);
  return { date, count };
}

/**
 * Exporta os dados reais da API (mesma fonte que as telas leem via `core/api/adapters/*`) pra
 * um único .xlsx com uma aba por entidade, no MESMO formato que `importWorkbookFile` espera de
 * volta — permite migrar dados entre ambientes (ex.: popular produção com o que já está
 * cadastrado em local) via export+reimport, sem depender da planilha de negócio original.
 *
 * Só "Dashboard" ainda vem do IndexedDB local — é o único indicador sem endpoint de criação na
 * API (dado derivado, só leitura, ver `dashboard.ts`).
 *
 * "Usuários": a API nunca devolve a senha (`GET /users` não tem esse campo, por segurança) nem
 * telefone (a API de usuários não tem essa coluna) — a aba sai com "Senha"/"Telefone" em
 * branco. Reimportar essa aba especificamente vai falhar linha a linha com "Senha vazia"
 * (`parseUsers` em `import.ts`) — comportamento esperado e não escondido: usuário precisa ser
 * recriado manualmente (ou com senha provisória) no ambiente de destino.
 *
 * "ID" (1ª coluna, todas as abas com entidade EXCETO Fluxo de Caixa/Usuários/Dashboard) é o id
 * real do registro no backend — reimportar uma linha com essa coluna preenchida vira UPDATE
 * idempotente em vez de CREATE (`upsert` em `import.ts`), então rodar export→reimport quantas
 * vezes quiser não duplica nada a partir da 2ª rodada em diante. Heurística de campos de negócio
 * (constraint única do backend) só protege contra duplicata na 1ª importação, quando ainda não
 * existe "ID" — duas vendas legitimamente diferentes que coincidam em todos os campos (raro, mas
 * possível) não são bloqueadas incorretamente numa reimportação subsequente, porque a 2ª vez em
 * diante vai por id, não por heurística.
 */
export async function buildExportWorkbook(injector: Injector): Promise<XLSX.WorkBook> {
  const http = runInInjectionContext(injector, () => inject(HttpClient));
  const idb = runInInjectionContext(injector, () => inject(IndexedDbService));
  const get = <T,>(path: string): Promise<T[]> => firstValueFrom(http.get<T[]>(`${environment.apiUrl}/${path}`));

  const [
    produtosApi,
    vendedoresApi,
    vendasApi,
    producaoApi,
    plantelApi,
    despesasApi,
    fluxoCaixaApi,
    usersApi,
    novoLotePlantelApi,
    feedStockApi,
    feedOpenLogApi,
    flockCleaningApi,
    barnsApi,
    barnStockApi,
    vendorStockApi,
    dashboardRows,
  ] = await Promise.all([
    get<ProductApi>('products'),
    get<VendedorApi>('vendedores'),
    get<SaleApi>('sales'),
    get<DailyProductionApi>('daily-productions'),
    get<FlockApi>('flock'),
    get<ExpenseApi>('expenses'),
    get<CashFlowApi>('cash-flows'),
    get<UserApi>('users'),
    get<FlockIncubationApi>('flock-incubations'),
    get<FeedStockApi>('feed-stocks'),
    get<FeedOpenLogApi>('feed-open-logs'),
    get<FlockCleaningApi>('flock-cleanings'),
    get<BarnApi>('barns'),
    get<BarnStockApi>('barn-stocks'),
    get<VendorStockApi>('vendor-stock'),
    firstValueFrom(idb.getAll<DashboardResumo>(IDB_STORES.dashboard)),
  ]);
  const dashboard = dashboardRows[0] ?? DASHBOARD_VAZIO;

  // Produto/Vendedor: `Venda` guarda NOME no front (autocomplete), API usa `product_id`/
  // `seller_id` — resolve id->nome com o que já foi buscado acima pras próprias abas
  // Produtos/Vendedores, sem GET extra (mesmo dado, 2 usos).
  const productNameById = new Map(produtosApi.map((p) => [p.id, p.name]));
  const vendedorNameById = new Map(vendedoresApi.map((v) => [v.id, v.name]));
  const barnNameById = new Map(barnsApi.map((b) => [b.id, b.name]));

  const wb = XLSX.utils.book_new();

  // `header` explícito em todo json_to_sheet abaixo: sem ele, uma lista vazia (conta nova,
  // categoria ainda sem nenhum registro) gera aba sem nem a linha de cabeçalho — reimportar
  // esse .xlsx falharia com "coluna(s) faltando" pra qualquer aba zerada no momento do export.

  // "Vendedores" ANTES de "Vendas" no arquivo por clareza de leitura (a ordem de
  // PROCESSAMENTO de fato é a de `IMPORTERS` em import.ts, não a das abas no arquivo) — banco
  // de produção nunca teve vendedor cadastrado (planilha de negócio original só tinha a coluna
  // solta "Vendedor" dentro de Vendas, sem aba própria).
  const vendedoresHeader = ['ID', 'Nome', 'Contato', 'Ativo'];
  const vendedoresSheet = XLSX.utils.json_to_sheet(
    vendedoresApi.map((v) => ({ ID: v.id, Nome: v.name, Contato: v.contact ?? '', Ativo: v.active ? 'Sim' : 'Não' })),
    { header: vendedoresHeader },
  );
  XLSX.utils.book_append_sheet(wb, vendedoresSheet, 'Vendedores');

  const galpoesHeader = ['ID', 'Nome', 'Localização', 'Início', 'Observação'];
  const galpoesSheet = XLSX.utils.json_to_sheet(
    barnsApi.map((b) => ({
      ID: b.id,
      Nome: b.name,
      'Localização': b.location ?? '',
      'Início': b.start_date ? ptDate(b.start_date) : '',
      'Observação': b.notes ?? '',
    })),
    { header: galpoesHeader },
  );
  XLSX.utils.book_append_sheet(wb, galpoesSheet, 'Galpões');

  const produtosHeader = ['ID', 'Produto', 'Unidade', 'Preço Unitário', 'Estoque', 'Ovos por Unidade'];
  const produtosSheet = XLSX.utils.json_to_sheet(
    produtosApi.map((p) => ({
      ID: p.id,
      Produto: p.name,
      Unidade: p.unit,
      'Preço Unitário': decimalToNumber(p.unit_price),
      Estoque: p.stock,
      'Ovos por Unidade': p.eggs_per_unit,
    })),
    { header: produtosHeader },
  );
  XLSX.utils.book_append_sheet(wb, produtosSheet, 'Produtos');

  const vendasHeader = [
    'ID', 'Data', 'Produto', 'Quantidade', 'Preço Unitário', 'Total', 'Status Pagamento',
    'Comprador', 'Vendedor', 'Status da entrega', 'Data da Entrega',
  ];
  const vendasSheet = XLSX.utils.json_to_sheet(
    vendasApi.map((v) => ({
      ID: v.id,
      Data: ptDate(v.date),
      Produto: productNameById.get(v.product_id) ?? '',
      Quantidade: v.quantity,
      'Preço Unitário': decimalToNumber(v.unit_price),
      Total: decimalToNumber(v.total),
      'Status Pagamento': v.payment_pending ? 'F' : 'PAGO',
      Comprador: v.buyer,
      Vendedor: vendedorNameById.get(v.seller_id) ?? '',
      'Status da entrega': v.delivery_pending ? 'FALTA' : 'ENTREGUE',
      'Data da Entrega': v.delivery_date ? ptDate(v.delivery_date) : '',
    })),
    { header: vendasHeader },
  );
  XLSX.utils.book_append_sheet(wb, vendasSheet, 'Vendas');

  const producaoHeader = ['ID', 'Data', 'Galpão', 'Ovos Codorna', 'Ovos Galinha'];
  const producaoSheet = XLSX.utils.json_to_sheet(
    producaoApi.map((p) => ({
      ID: p.id,
      Data: ptDate(p.date),
      'Galpão': p.barn_id != null ? (barnNameById.get(p.barn_id) ?? '') : '',
      'Ovos Codorna': p.quail_eggs ?? '',
      'Ovos Galinha': p.chicken_eggs ?? '',
    })),
    { header: producaoHeader },
  );
  XLSX.utils.book_append_sheet(wb, producaoSheet, 'Produção');

  const plantelHeader = ['ID', 'Espécie', 'Galpão', 'Quantidade', 'Sacos Ração/Mês', 'Preço Saco', 'Total Mês'];
  const plantelSheet = XLSX.utils.json_to_sheet(
    plantelApi.map((p) => ({
      ID: p.id,
      Espécie: p.species,
      'Galpão': p.barn_id != null ? (barnNameById.get(p.barn_id) ?? '') : '',
      Quantidade: p.quantity,
      'Sacos Ração/Mês': p.feed_bags_per_month,
      'Preço Saco': decimalToNumber(p.bag_price),
      'Total Mês': decimalToNumber(p.monthly_total),
    })),
    { header: plantelHeader },
  );
  XLSX.utils.book_append_sheet(wb, plantelSheet, 'Plantel');

  const estoqueGalpaoHeader = ['Galpão', 'Produto', 'Quantidade'];
  const estoqueGalpaoSheet = XLSX.utils.json_to_sheet(
    barnStockApi.map((b) => ({
      'Galpão': barnNameById.get(b.barn_id) ?? '',
      Produto: productNameById.get(b.product_id) ?? '',
      Quantidade: b.quantity,
    })),
    { header: estoqueGalpaoHeader },
  );
  XLSX.utils.book_append_sheet(wb, estoqueGalpaoSheet, 'Estoque Galpão');

  const estoqueVendedorHeader = ['Vendedor', 'Produto', 'Quantidade'];
  const estoqueVendedorSheet = XLSX.utils.json_to_sheet(
    vendorStockApi.map((v) => ({
      Vendedor: vendedorNameById.get(v.vendedor_id) ?? '',
      Produto: productNameById.get(v.product_id) ?? '',
      Quantidade: v.quantity,
    })),
    { header: estoqueVendedorHeader },
  );
  XLSX.utils.book_append_sheet(wb, estoqueVendedorSheet, 'Estoque Vendedor');

  const despesasHeader = ['ID', 'Data', 'Descrição', 'Categoria', 'Qtd.', 'Valor unit.', 'Valor', 'Pago'];
  const despesasSheet = XLSX.utils.json_to_sheet(
    despesasApi.map((e) => ({
      ID: e.id,
      Data: ptDate(e.date),
      Descrição: e.description,
      Categoria: e.category,
      'Qtd.': e.quantity ?? '',
      'Valor unit.': decimalToNullableNumber(e.unit_price) ?? '',
      Valor: decimalToNumber(e.amount),
      Pago: e.paid ? 'Sim' : 'Não',
    })),
    { header: despesasHeader },
  );
  XLSX.utils.book_append_sheet(wb, despesasSheet, 'Despesas');

  const fluxoCaixaHeader = ['Data', 'Descrição', 'Tipo', 'Valor'];
  const fluxoCaixaSheet = XLSX.utils.json_to_sheet(
    fluxoCaixaApi.map((c) => ({
      Data: ptDate(c.date),
      Descrição: c.description,
      Tipo: c.inflow ? 'Entrada' : 'Saída',
      Valor: decimalToNumber(c.amount),
    })),
    { header: fluxoCaixaHeader },
  );
  XLSX.utils.book_append_sheet(wb, fluxoCaixaSheet, 'Fluxo de Caixa');

  const dashboardSheet = XLSX.utils.json_to_sheet([
    { Indicador: 'Total de codornas', Valor: dashboard.totalQuails },
    { Indicador: 'Total de galinhas', Valor: dashboard.totalChickens },
    { Indicador: 'Produção diária codornas', Valor: dashboard.dailyQuailProduction },
    { Indicador: 'Produção diária galinhas', Valor: dashboard.dailyChickenProduction },
    { Indicador: 'Preço pack 50 ovos codorna', Valor: dashboard.quailPack50Price },
    { Indicador: 'Preço pack 30 ovos galinha', Valor: dashboard.chickenPack30Price },
  ]);
  XLSX.utils.book_append_sheet(wb, dashboardSheet, 'Dashboard');

  const usuariosHeader = ['Nome', 'E-mail', 'Senha', 'Telefone'];
  const usuariosSheet = XLSX.utils.json_to_sheet(
    // Senha/Telefone sempre em branco — ver comentário da função sobre por que a API não
    // devolve nenhum dos dois.
    usersApi.map((u) => ({ Nome: u.name, 'E-mail': u.email, Senha: '', Telefone: '' })),
    { header: usuariosHeader },
  );
  XLSX.utils.book_append_sheet(wb, usuariosSheet, 'Usuários');

  const novoLotePlantelHeader = [
    'ID', 'Data Incubadora', 'Espécie', 'Qtd. Ovos', 'Eclosão Prevista', 'Data Eclosão',
    'Qtd. Nascida', 'Status', 'Custo Ovos', 'Custo Ração', 'Observações',
  ];
  const novoLotePlantelSheet = XLSX.utils.json_to_sheet(
    novoLotePlantelApi.map((n) => {
      const hatched = consolidateHatchEvents(n.hatch_events);
      return {
        ID: n.id,
        'Data Incubadora': ptDate(n.start_date),
        Espécie: speciesLabel(n.species),
        'Qtd. Ovos': n.egg_count,
        'Eclosão Prevista': ptDate(n.expected_hatch_date),
        'Data Eclosão': hatched ? ptDate(hatched.date) : '',
        'Qtd. Nascida': hatched ? hatched.count : '',
        Status: n.status,
        'Custo Ovos': decimalToNullableNumber(n.egg_cost) ?? '',
        'Custo Ração': decimalToNullableNumber(n.feed_cost) ?? '',
        Observações: n.notes ?? '',
      };
    }),
    { header: novoLotePlantelHeader },
  );
  XLSX.utils.book_append_sheet(wb, novoLotePlantelSheet, 'Novo Plantel');

  const racaoHeader = ['ID', 'Tipo', 'Sacos em Estoque', 'Kg em Estoque', 'Peso do Saco', 'Validade'];
  const racaoSheet = XLSX.utils.json_to_sheet(
    feedStockApi.map((f) => ({
      ID: f.id,
      Tipo: f.type,
      'Sacos em Estoque': f.bags_in_stock,
      'Kg em Estoque': decimalToNumber(f.kg_in_stock),
      'Peso do Saco': decimalToNumber(f.last_bag_weight_kg),
      Validade: f.expiration_date ? ptDate(f.expiration_date) : '',
    })),
    { header: racaoHeader },
  );
  XLSX.utils.book_append_sheet(wb, racaoSheet, 'Ração');

  const racaoAbertosHeader = ['ID', 'Data', 'Tipo', 'Peso Aberto (kg)'];
  const racaoAbertosSheet = XLSX.utils.json_to_sheet(
    [...feedOpenLogApi]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((l) => ({
        ID: l.id,
        Data: ptDate(l.date),
        Tipo: l.feed_type,
        'Peso Aberto (kg)': decimalToNumber(l.weight_kg),
      })),
    { header: racaoAbertosHeader },
  );
  XLSX.utils.book_append_sheet(wb, racaoAbertosSheet, 'Ração - Sacos Abertos');

  const cleaningTypeLabel: Record<FlockCleaning['cleaningType'], string> = {
    total: 'Total',
    feeder: 'Bebedouro',
    tray: 'Bandeja',
    nest: 'Ninho',
  };
  const higienizacaoHeader = ['ID', 'Data', 'Espécie', 'Tipo', 'Observações'];
  const higienizacaoSheet = XLSX.utils.json_to_sheet(
    [...flockCleaningApi]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((h) => ({
        ID: h.id,
        Data: ptDate(h.date),
        Espécie: speciesLabel(h.species),
        Tipo: cleaningTypeLabel[h.cleaning_type],
        Observações: h.notes ?? '',
      })),
    { header: higienizacaoHeader },
  );
  XLSX.utils.book_append_sheet(wb, higienizacaoSheet, 'Higienização');

  return wb;
}

/** Monta o workbook (`buildExportWorkbook`) e dispara o download do .xlsx. */
export async function exportWorkbook(filename: string, injector: Injector): Promise<void> {
  const wb = await buildExportWorkbook(injector);
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
