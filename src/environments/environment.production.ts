import { Environment } from './environment.type';

/**
 * Ambiente de produção. Usado no build via `fileReplacements`
 * (ver angular.json, configurations.production).
 *
 * TODO: trocar pelo domínio real da API assim que o backend tiver um
 * domínio de produção definido. Não commitar URL real com credenciais
 * embutidas (não deveria ter credencial em URL de qualquer forma).
 */
export const environment: Environment = {
  production: true,
  apiUrl: 'https://api.seudominio.com/api', // TODO: trocar pelo domínio real
};
