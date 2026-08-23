import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';

import { LayoutApp } from './layout-app';

describe('LayoutApp', () => {
  let component: LayoutApp;
  let fixture: ComponentFixture<LayoutApp>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayoutApp],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(LayoutApp);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('sair() chama o logout da API e navega pro login', async () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const promise = component['sair']();
    httpMock.expectOne(`${environment.apiUrl}/logout`).flush(null, { status: 204, statusText: 'No Content' });
    await promise;

    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  // Regressão: bug reportado do "loop de carregamento infinito" no Importar —
  // `confirmarImportacao()` não tinha try/catch. Qualquer rejeição de
  // `importWorkbookFile()` (rede/CORS, parse, timeout) deixava o Promise
  // rejeitar sem NUNCA tocar `importState`, e o modal ficava travado em
  // "confirm" (sem spinner, sem erro, pra sempre — indistinguível de "loading
  // infinito" pro usuário). Agora qualquer falha sempre resolve pro estado
  // 'errors'.
  it('confirmarImportacao() nunca trava em "confirm" quando o import rejeita de forma inesperada (rede/CORS/parse)', async () => {
    // Arquivo cujo .arrayBuffer() rejeita — simula falha antes até do XLSX.read
    // (o mesmo tipo de exceção não coberta que antes escapava sem try/catch:
    // rede caída, CORS, timeout). Real `importWorkbookFile` é usado (sem mock),
    // pra provar o comportamento fim-a-fim, não só a lógica isolada.
    const brokenFile = {
      arrayBuffer: () => Promise.reject(new Error('Falha de conexão com o servidor (rede ou CORS).')),
    } as unknown as File;

    component['pendingFile'] = brokenFile;
    component['importState'].set('confirm');

    await component['confirmarImportacao']();

    expect(component['importState']()).toBe('errors');
    expect(component['importState']()).not.toBe('confirm');
    expect(component['importErrors']()).toEqual([
      'Falha inesperada ao importar: Falha de conexão com o servidor (rede ou CORS).',
    ]);
  });
});
