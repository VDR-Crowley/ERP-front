import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Vendedor } from '@core/interfaces/vendedor.interface';
import { environment } from '../../../../environments/environment';
import { createRestEntityStore, EntityStore } from '../entity-store';

interface VendedorApi {
  id: number;
  name: string;
  contact: string | null;
  active: boolean;
}

function toFront(api: VendedorApi): Vendedor {
  return { name: api.name, contact: api.contact ?? '', active: api.active };
}

function toApi(item: Vendedor) {
  return { name: item.name, contact: item.contact || null, active: item.active };
}

export function createVendedoresStore(): EntityStore<Vendedor> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/vendedores`;

  return createRestEntityStore<Vendedor, VendedorApi>({
    list: () => http.get<VendedorApi[]>(base),
    create: (item) => http.post<VendedorApi>(base, toApi(item)),
    update: (id, item) => http.put<VendedorApi>(`${base}/${id}`, toApi(item)),
    remove: (id) => http.delete<void>(`${base}/${id}`),
    toFront,
  });
}
