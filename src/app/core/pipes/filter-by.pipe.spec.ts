import { FilterByPipe } from './filter-by.pipe';

describe('FilterByPipe', () => {
  const pipe = new FilterByPipe();

  it('encontra item por data em formato ISO simples digitando dd/mm', () => {
    const items = [{ date: '2026-08-22' }, { date: '2026-08-23' }];
    expect(pipe.transform(items, '22/08', ['date'])).toEqual([{ date: '2026-08-22' }]);
  });

  it('encontra item por data em datetime ISO completo do backend digitando dd/mm', () => {
    const items = [
      { date: '2026-08-22T00:00:00.000000Z' },
      { date: '2026-08-23T00:00:00.000000Z' },
    ];
    expect(pipe.transform(items, '22/08', ['date'])).toEqual([
      { date: '2026-08-22T00:00:00.000000Z' },
    ]);
  });

  it('retorna tudo quando a busca é vazia', () => {
    const items = [{ date: '2026-08-22' }];
    expect(pipe.transform(items, '', ['date'])).toEqual(items);
  });
});
