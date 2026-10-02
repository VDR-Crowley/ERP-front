import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { UserAccount } from '@core/interfaces/user-account.interface';
import { environment } from '../../../../environments/environment';
import { createRestEntityStore, EntityStore } from '../entity-store';

interface UserApi {
  id: number;
  name: string;
  email: string;
  role: string;
  vendedor_id: number | null;
  vendedor_name: string | null;
  is_active: boolean;
  created_at: string;
}

function toFront(api: UserApi): UserAccount {
  return {
    name: api.name,
    email: api.email,
    isActive: api.is_active,
    role: api.role,
    vendedorId: api.vendedor_id != null ? String(api.vendedor_id) : null,
    vendedorName: api.vendedor_name,
  };
}

/** Role opcional (default ADMINISTRADOR no backend). VENDEDOR precisa de vendedor_id. */
function toApiCreate(item: UserAccount) {
  return {
    name: item.name,
    email: item.email,
    password: item.password,
    password_confirmation: item.passwordConfirmation,
    ...(item.role ? { role: item.role } : {}),
    ...(item.role === 'VENDEDOR' && item.vendedorId ? { vendedor_id: Number(item.vendedorId) } : {}),
  };
}

/** `password`/`password_confirmation` só entram no payload quando a senha foi trocada (ver UserAccount). */
function toApiUpdate(item: UserAccount) {
  return {
    name: item.name,
    email: item.email,
    is_active: item.isActive,
    ...(item.password ? { password: item.password, password_confirmation: item.passwordConfirmation } : {}),
  };
}

export function createUsersStore(): EntityStore<UserAccount> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/users`;

  return createRestEntityStore<UserAccount, UserApi>({
    list: () => http.get<UserApi[]>(base),
    create: (item) => http.post<UserApi>(base, toApiCreate(item)),
    update: (id, item) => http.put<UserApi>(`${base}/${id}`, toApiUpdate(item)),
    remove: (id) => http.delete<void>(`${base}/${id}`),
    toFront,
  });
}
