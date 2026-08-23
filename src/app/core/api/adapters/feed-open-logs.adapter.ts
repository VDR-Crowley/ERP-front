import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FeedOpenLog } from '@core/interfaces/feed-stock.interface';
import { environment } from '../../../../environments/environment';
import { createReadOnlyEntityStore, decimalToNumber, EntityStore } from '../entity-store';

interface FeedOpenLogApi {
  id: number;
  feed_stock_id: number | null;
  feed_type: string;
  date: string;
  weight_kg: string;
}

function toFront(api: FeedOpenLogApi): FeedOpenLog {
  return { feedType: api.feed_type, date: api.date, weightKg: decimalToNumber(api.weight_kg) };
}

/** Somente leitura — o backend só cria log via `POST /feed-stocks/{id}/open-bag` (ver `feed-stocks.adapter.ts`). */
export function createFeedOpenLogsStore(): EntityStore<FeedOpenLog> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/feed-open-logs`;

  return createReadOnlyEntityStore<FeedOpenLog, FeedOpenLogApi>(() => http.get<FeedOpenLogApi[]>(base), toFront);
}
