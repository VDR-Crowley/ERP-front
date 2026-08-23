import { Environment } from './environment.type';

/**
 * Ambiente de produção. Usado no build via `fileReplacements`
 * (ver angular.json, configurations.production).
 *
 * Backend real (Railway): rotas registradas em ERP-Backend/routes/api.php,
 * prefixo `/api` vem do `withRouting(api: ...)` padrão do Laravel
 * (bootstrap/app.php, sem override de prefixo).
 */
export const environment: Environment = {
  production: true,
  apiUrl: 'https://laravel-production-4c67.up.railway.app/api',
};
