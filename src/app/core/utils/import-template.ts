import * as XLSX from 'xlsx';

/** Gera um .xlsx modelo com as abas e cabeçalhos esperados pelo import, com 1-2 linhas de exemplo. */
export function downloadImportTemplate(filename: string): void {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      {
        Data: '01/07/2026',
        Produto: '50 ovos de codorna',
        Quantidade: 1,
        'Preço Unitário': 15,
        Total: 15,
        'Status Pagamento': 'PAGO',
        Comprador: 'Jailson',
        Vendedor: 'Karol',
        'Status da entrega': 'FALTA',
        'Data da Entrega': '',
      },
      {
        Data: '01/07/2026',
        Produto: '50 ovos de codorna',
        Quantidade: 1,
        'Preço Unitário': 15,
        Total: 15,
        'Status Pagamento': 'PAGO',
        Comprador: 'Jefferson',
        Vendedor: 'Karol',
        'Status da entrega': 'ENTREGUE',
        'Data da Entrega': '05/07/2026',
      },
    ]),
    'Vendas',
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { Data: '01/07/2026', 'Ovos Codorna': 125, 'Ovos Galinha': 20 },
      { Data: '02/07/2026', 'Ovos Codorna': '', 'Ovos Galinha': 22 },
    ]),
    'Produção',
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      {
        Data: '01/07/2026',
        'Ovos Codorna': 335,
        'Ovos Galinha': 70,
        'Pack Codorna': 6.7,
        'Pack Galinha': 2.33,
        'Valor Estoque Codorna': 100.5,
        'Valor Estoque Galinha': 46.67,
      },
    ]),
    'Estoque de Ovos',
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { Espécie: 'Codornas', Quantidade: 130, 'Sacos Ração/Mês': 3, 'Preço Saco': 106, 'Total Mês': 318 },
      {
        Espécie: 'Galinhas Embrapa 051',
        Quantidade: 32,
        'Sacos Ração/Mês': 4,
        'Preço Saco': 100,
        'Total Mês': 400,
      },
    ]),
    'Plantel',
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      {
        Produto: '50 ovos de codorna',
        Unidade: 'Bandeja (50 ovos)',
        'Preço Unitário': 15,
        Estoque: 26,
        'Ovos por Unidade': 50,
      },
    ]),
    'Produtos',
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      {
        Data: '01/07/2026',
        Descrição: 'Ração codornas',
        Categoria: 'Ração',
        'Qtd.': 1,
        'Valor unit.': 106,
        Valor: 106,
        Pago: 'Sim',
      },
      {
        Data: '02/07/2026',
        Descrição: 'Conta de energia',
        Categoria: 'Energia',
        'Qtd.': '',
        'Valor unit.': '',
        Valor: 187.5,
        Pago: 'Não',
      },
    ]),
    'Despesas',
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { Data: '01/07/2026', Descrição: 'Venda 50 ovos codorna', Tipo: 'Entrada', Valor: 15 },
      { Data: '02/07/2026', Descrição: 'Compra de ração', Tipo: 'Saída', Valor: 106 },
    ]),
    'Fluxo de Caixa',
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { Indicador: 'Total de codornas', Valor: 130 },
      { Indicador: 'Total de galinhas', Valor: 32 },
      { Indicador: 'Produção diária codornas', Valor: 125 },
      { Indicador: 'Produção diária galinhas', Valor: 22 },
      { Indicador: 'Preço pack 50 ovos codorna', Valor: 15 },
      { Indicador: 'Preço pack 30 ovos galinha', Valor: 25 },
    ]),
    'Dashboard',
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { Nome: 'Karol', 'E-mail': 'karol@minierp.com', Senha: '123456', Telefone: '(11) 90000-0001' },
      { Nome: 'Jailson', 'E-mail': 'jailson@minierp.com', Senha: '123456', Telefone: '(11) 90000-0002' },
    ]),
    'Usuários',
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      {
        'Data Incubadora': '01/07/2026',
        Espécie: 'Codorna',
        'Qtd. Ovos': 100,
        'Eclosão Prevista': '19/07/2026',
        'Data Eclosão': '',
        'Qtd. Nascida': '',
        Status: 'incubando',
        'Custo Ovos': 75,
        'Custo Ração': 200,
        Observações: '',
      },
      {
        'Data Incubadora': '01/06/2026',
        Espécie: 'Galinha',
        'Qtd. Ovos': 40,
        'Eclosão Prevista': '22/06/2026',
        'Data Eclosão': '23/06/2026',
        'Qtd. Nascida': 32,
        Status: 'eclodido',
        'Custo Ovos': 90,
        'Custo Ração': 210,
        Observações: 'Lote Embrapa 051',
      },
    ]),
    'Novo Plantel',
  );

  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
