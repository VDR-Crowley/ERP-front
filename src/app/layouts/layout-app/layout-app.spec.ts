import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LayoutApp } from './layout-app';

describe('LayoutApp', () => {
  let component: LayoutApp;
  let fixture: ComponentFixture<LayoutApp>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayoutApp],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LayoutApp);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
