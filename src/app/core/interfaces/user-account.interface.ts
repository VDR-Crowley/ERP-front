/**
 * Usuário administrado pela tela de admin (`GET/POST/PUT/DELETE /users`) —
 * diferente do cadastro público (`/register`) e do `User` legado em
 * `user.interface.ts` (usado só pelo backup XLSX via IndexedDB).
 *
 * `password`/`passwordConfirmation` só viajam pro backend quando presentes:
 * sempre na criação, opcionais na edição (vazios = não troca a senha).
 */
export interface UserAccount {
  name: string;
  email: string;
  isActive: boolean;
  password?: string;
  passwordConfirmation?: string;
}
