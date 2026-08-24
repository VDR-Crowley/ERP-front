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

  // "Vendedores" precisa existir ANTES de "Vendas" ser reimportada — a coluna
  // Vendedor da aba Vendas resolve por nome contra essa aba (ver IMPORTERS em
  // import.ts). Ordem das abas no arquivo não importa (import lê por nome),
  // só a ordem de processamento interna do import.
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { Nome: 'Karol', Contato: '(11) 90000-0001', Ativo: 'Sim' },
    ]),
    'Vendedores',
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

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      {
        Tipo: 'Codorna postura',
        'Sacos em Estoque': 5,
        'Kg em Estoque': 100,
        'Peso do Saco': 20,
        Validade: '01/12/2026',
      },
      {
        Tipo: 'Galinha crescimento',
        'Sacos em Estoque': 3,
        'Kg em Estoque': 120,
        'Peso do Saco': 40,
        Validade: '15/11/2026',
      },
    ]),
    'Ração',
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { Data: '01/07/2026', Tipo: 'Codorna postura', 'Peso Aberto (kg)': 20 },
      { Data: '05/07/2026', Tipo: 'Galinha crescimento', 'Peso Aberto (kg)': 40 },
    ]),
    'Ração - Sacos Abertos',
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { Data: '01/07/2026', Espécie: 'Codorna', Tipo: 'Total', Observações: 'Limpeza geral do galpão' },
      { Data: '03/07/2026', Espécie: 'Codorna', Tipo: 'Bandeja', Observações: '' },
      { Data: '02/07/2026', Espécie: 'Galinha', Tipo: 'Bebedouro', Observações: '' },
      { Data: '04/07/2026', Espécie: 'Galinha', Tipo: 'Ninho', Observações: 'Troca de forração' },
    ]),
    'Higienização',
  );

  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
