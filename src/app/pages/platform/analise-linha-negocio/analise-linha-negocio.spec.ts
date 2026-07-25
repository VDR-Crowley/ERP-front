import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AnaliseLinhaNegocio } from './analise-linha-negocio';

// jsdom (ambiente de teste) não implementa ResizeObserver, usado pelo ApexCharts
// para redimensionar o gráfico ao montar o componente.
/* eslint-disable @typescript-eslint/no-empty-function */
if (typeof ResizeObserver === 'undefined') {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
/* eslint-enable @typescript-eslint/no-empty-function */

describe('AnaliseLinhaNegocio', () => {
  let component: AnaliseLinhaNegocio;
  let fixture: ComponentFixture<AnaliseLinhaNegocio>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnaliseLinhaNegocio],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AnaliseLinhaNegocio);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
