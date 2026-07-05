import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'erp-theme';
const DARK_CLASS = 'app-dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  protected readonly darkMode = signal<boolean>(this.readInitial());

  constructor() {
    this.apply(this.darkMode());
  }

  isDark(): boolean {
    return this.darkMode();
  }

  toggle(): void {
    this.setDark(!this.darkMode());
  }

  setDark(value: boolean): void {
    this.darkMode.set(value);
    this.apply(value);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, value ? 'dark' : 'light');
    }
  }

  private apply(dark: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.classList.toggle(DARK_CLASS, dark);
  }

  private readInitial(): boolean {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains(DARK_CLASS);
    }
    return true;
  }
}
