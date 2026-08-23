import { brl, num, ptDate } from './format';

describe('ptDate', () => {
  it('formata data simples aaaa-mm-dd (formato antigo do IndexedDB)', () => {
    expect(ptDate('2026-06-21')).toBe('21/06/2026');
  });

  it('formata datetime ISO completo do backend (Laravel/Carbon)', () => {
    expect(ptDate('2026-08-22T00:00:00.000000Z')).toBe('22/08/2026');
  });

  it('formata datetime ISO sem microssegundos', () => {
    expect(ptDate('2026-08-22T00:00:00Z')).toBe('22/08/2026');
  });

  it('formata datetime ISO com offset de fuso em vez de Z', () => {
    expect(ptDate('2026-08-22T10:30:00-03:00')).toBe('22/08/2026');
  });

  it('não sofre drift de fuso horário perto da virada do dia em UTC', () => {
    // 21h em UTC-3 (Brasil) é meia-noite UTC do dia seguinte; a extração é
    // puramente textual (sem passar por Date), então o dia salvo no
    // backend não pode "andar" um dia pra frente ou pra trás.
    expect(ptDate('2026-08-22T23:59:59.999999Z')).toBe('22/08/2026');
    expect(ptDate('2026-08-22T00:00:00.000000Z')).toBe('22/08/2026');
  });

  it('aceita Date usando componentes locais (não UTC)', () => {
    // 22/08/2026 03:00 local: se convertido pra UTC podendo virar 22 ou 23
    // dependendo do fuso, mas o dia exibido tem que ser o dia local, sempre.
    const date = new Date(2026, 7, 22, 3, 0, 0); // mês 0-indexed: 7 = agosto
    expect(ptDate(date)).toBe('22/08/2026');
  });

  it('retorna a string original se não reconhecer o formato', () => {
    expect(ptDate('não é data')).toBe('não é data');
    expect(ptDate('')).toBe('');
  });
});

describe('brl', () => {
  it('formata número como moeda BRL', () => {
    expect(brl(1234.5)).toBe('R$ 1.234,50');
  });

  it('trata null/undefined como zero', () => {
    expect(brl(null)).toBe('R$ 0,00');
    expect(brl(undefined)).toBe('R$ 0,00');
  });
});

describe('num', () => {
  it('formata número com separador pt-BR', () => {
    expect(num(1234, 0)).toBe('1.234');
  });

  it('retorna travessão para null/undefined', () => {
    expect(num(null)).toBe('—');
    expect(num(undefined)).toBe('—');
  });
});
