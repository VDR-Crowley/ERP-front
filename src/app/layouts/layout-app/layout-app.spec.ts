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
});
