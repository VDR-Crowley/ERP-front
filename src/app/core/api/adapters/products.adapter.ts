import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Product } from '@core/interfaces/product.interface';
import { environment } from '../../../../environments/environment';
import { createRestEntityStore, decimalToNumber, EntityStore } from '../entity-store';

interface ProductApi {
  id: number;
  name: string;
  unit: string;
  unit_price: string;
  stock: number;
  eggs_per_unit: number;
}

function toFront(api: ProductApi): Product {
  return {
    name: api.name,
    unit: api.unit,
    unitPrice: decimalToNumber(api.unit_price),
    stock: api.stock,
    eggsPerUnit: api.eggs_per_unit,
  };
}

function toApi(item: Product) {
  return {
    name: item.name,
    unit: item.unit,
    unit_price: item.unitPrice,
    stock: item.stock,
    eggs_per_unit: item.eggsPerUnit,
  };
}

export function createProductsStore(): EntityStore<Product> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/products`;

  return createRestEntityStore<Product, ProductApi>({
    list: () => http.get<ProductApi[]>(base),
    create: (item) => http.post<ProductApi>(base, toApi(item)),
    update: (id, item) => http.put<ProductApi>(`${base}/${id}`, toApi(item)),
    remove: (id) => http.delete<void>(`${base}/${id}`),
    toFront,
  });
}
