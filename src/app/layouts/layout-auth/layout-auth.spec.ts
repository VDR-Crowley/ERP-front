import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LayoutAuth } from './layout-auth';

describe('LayoutAuth', () => {
  let component: LayoutAuth;
  let fixture: ComponentFixture<LayoutAuth>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayoutAuth],
    }).compileComponents();

    fixture = TestBed.createComponent(LayoutAuth);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
