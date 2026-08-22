import { environment } from './environment';

// Testa a infraestrutura de environment em si — nenhum serviço de auth
// (AuthSession, UsersService) consome environment.apiUrl ainda, isso é
// preparação pra integração com o ERP-Backend (Laravel) numa etapa futura.
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
