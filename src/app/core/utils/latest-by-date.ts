/**
 * Encontra o registro mais recente por `date` (ISO 'YYYY-MM-DD'), comparando
 * strings — funciona porque ISO ordena lexicograficamente igual a
 * cronologicamente. Não exige `date <= hoje`: cada linha é um snapshot que o
 * usuário lançou manualmente, então uma data futura por erro de digitação
 * ainda deve contar como "mais recente" em vez de fazer o carry-forward cair
 * pra `undefined` e zerar os cards.
 */
export function latestByDate<T extends { date: string }>(items: T[]): T | undefined {
  return items.reduce<T | undefined>(
    (maisRecente, item) => (!maisRecente || item.date > maisRecente.date ? item : maisRecente),
    undefined,
  );
}
