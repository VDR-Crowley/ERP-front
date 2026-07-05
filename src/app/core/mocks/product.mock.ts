import { Product } from '@core/interfaces/product.interface';

// Preço unitário = valor mais frequente praticado nas vendas (ver venda.mock.ts)
// Nomes alinhados com a planilha real (Mini_ERP_Julho_Criacao_Codornas_Galinhas.xlsx, aba "Vendas")
export const PRODUCTS_MOCK: Product[] = [
  {
    name: '1 Bandeja de ovos de galinha',
    unit: 'Bandeja (30 ovos)',
    unitPrice: 20,
    stock: 12,
    eggsPerUnit: 30,
  },
  {
    name: '50 ovos de codorna',
    unit: 'Bandeja (50 ovos)',
    unitPrice: 15,
    stock: 26,
    eggsPerUnit: 50,
  },
  {
    name: '30 ovos galinha',
    unit: 'Bandeja (30 ovos)',
    unitPrice: 25,
    stock: 9,
    eggsPerUnit: 30,
  },
  {
    name: '5 ovos Galinha + 50 Codorna',
    unit: 'Kit misto',
    unitPrice: 30,
    stock: 15,
    eggsPerUnit: 55,
  },
];
