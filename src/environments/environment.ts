import { Environment } from './environment.type';

/**
 * Ambiente de desenvolvimento (`ng serve`, `ng test`).
 * Trocado por `environment.production.ts` no build de produção via
 * `fileReplacements` (ver angular.json).
 *
 * `environment.local.ts` (git-ignorado, ver .gitignore) pode sobrescrever
 * este arquivo para overrides locais — crie-o só se precisar apontar pra
 * uma API diferente da porta padrão do `php artisan serve`.
 */
export const environment: Environment = {
  production: false,
  // Porta padrão de `php artisan serve` no ERP-Backend (confirmado em
  // ERP-Backend/.env: APP_URL=http://localhost:8000, rotas em routes/api.php).
  apiUrl: 'http://localhost:8000/api',
};
