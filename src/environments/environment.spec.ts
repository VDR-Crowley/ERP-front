import { environment } from './environment';

// Testa a infraestrutura de environment em si — `AuthApiService` (ver
// src/app/core/auth/) consome environment.apiUrl pra falar com o
// ERP-Backend.
describe('environment', () => {
  it('define apiUrl como uma URL http(s) válida', () => {
    expect(environment.apiUrl).toBeTruthy();
    expect(() => new URL(environment.apiUrl)).not.toThrow();
    expect(new URL(environment.apiUrl).protocol).toMatch(/^https?:$/);
  });

  it('não aponta pro ambiente de produção durante os testes', () => {
    expect(environment.production).toBe(false);
  });
});
