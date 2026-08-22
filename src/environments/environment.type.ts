/**
 * Contrato compartilhado entre `environment.ts` (dev) e `environment.production.ts`
 * (prod). Garante que os dois arquivos exponham exatamente as mesmas chaves —
 * o build falha em tempo de compilação (TS) se um deles ficar desalinhado.
 *
 * IMPORTANTE: env do Angular roda no navegador. Tudo aqui é público, mesmo
 * em build de produção (visível no bundle JS). NUNCA coloque aqui:
 *   - API keys / secrets de serviços terceiros (Stripe, AWS, etc.)
 *   - Credenciais de banco de dados
 *   - Qualquer segredo que precise ficar só no backend (ERP-Backend/.env)
 *
 * "apiUrl" é a base da API Laravel (ERP-Backend). Nenhum serviço de auth
 * (AuthSession, UsersService) consome isso ainda — infraestrutura só, a
 * integração real vem em outra etapa.
 */
export interface Environment {
  /** true no build de produção (`ng build`), false em dev (`ng serve`). */
  production: boolean;
  /** Base da API do ERP-Backend (Laravel), sem barra final. Ex: `/api/produtos`. */
  apiUrl: string;
}
