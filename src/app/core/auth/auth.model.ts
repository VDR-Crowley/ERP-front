import { HttpContextToken } from '@angular/common/http';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

export interface AuthTokenResponse {
  user: AuthUser;
  token_type: string;
  access_token: string;
  access_token_expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string;
}

export interface MessageResponse {
  message: string;
}

export interface ValidationErrorResponse {
  message: string;
  errors?: Record<string, string[]>;
}

export type AuthRequestKind = 'default' | 'public' | 'refresh';

/**
 * Marca como o `authInterceptor` deve tratar a requisição:
 * - 'default' (padrão): injeta o access_token; em 401 tenta refresh e repete
 *   a chamada original uma vez.
 * - 'public': não injeta token (endpoint não autenticado — login, registro,
 *   fluxo de esqueci-senha); em 401 só repassa o erro, sem tentar refresh.
 * - 'refresh': não injeta o access_token (quem chama, `AuthApiService`, já
 *   setou o header com o refresh_token); em 401 desloga e redireciona pro
 *   login sem tentar refresh de novo — essa chamada JÁ É o refresh.
 */
export const AUTH_REQUEST_KIND = new HttpContextToken<AuthRequestKind>(() => 'default');
