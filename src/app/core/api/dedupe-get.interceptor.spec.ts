import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { dedupeGetInterceptor } from './dedupe-get.interceptor';

describe('dedupeGetInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([dedupeGetInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('3 GETs concorrentes pra mesma URL disparam só 1 requisição real e todos recebem a resposta', () => {
    const url = `${environment.apiUrl}/products`;
    let a: unknown, b: unknown, c: unknown;
    http.get(url).subscribe((res) => (a = res));
    http.get(url).subscribe((res) => (b = res));
    http.get(url).subscribe((res) => (c = res));

    httpMock.expectOne(url).flush([{ id: 1 }]);

    expect(a).toEqual([{ id: 1 }]);
    expect(b).toEqual([{ id: 1 }]);
    expect(c).toEqual([{ id: 1 }]);
  });

  it('depois que a 1ª requisição completa, a próxima chamada (não concorrente) busca de novo', () => {
    const url = `${environment.apiUrl}/products`;
    http.get(url).subscribe();
    httpMock.expectOne(url).flush([]);

    http.get(url).subscribe();
    httpMock.expectOne(url).flush([]);
  });

  it('GETs concorrentes pra URLs diferentes não são deduplicados', () => {
    http.get(`${environment.apiUrl}/products`).subscribe();
    http.get(`${environment.apiUrl}/vendedores`).subscribe();

    httpMock.expectOne(`${environment.apiUrl}/products`).flush([]);
    httpMock.expectOne(`${environment.apiUrl}/vendedores`).flush([]);
  });

  it('não deduplica requisições fora da apiUrl', () => {
    let a: unknown, b: unknown;
    http.get('https://outro-dominio.com/x').subscribe((res) => (a = res));
    http.get('https://outro-dominio.com/x').subscribe((res) => (b = res));

    const reqs = httpMock.match('https://outro-dominio.com/x');
    expect(reqs.length).toBe(2);
    reqs[0].flush({ ok: 1 });
    reqs[1].flush({ ok: 2 });

    expect(a).toEqual({ ok: 1 });
    expect(b).toEqual({ ok: 2 });
  });

  it('não deduplica POST/PUT/DELETE, só GET', () => {
    const url = `${environment.apiUrl}/products`;
    http.post(url, {}).subscribe();
    http.post(url, {}).subscribe();

    const reqs = httpMock.match(url);
    expect(reqs.length).toBe(2);
    reqs.forEach((r) => r.flush({}));
  });
});
