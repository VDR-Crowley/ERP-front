import { TestBed } from '@angular/core/testing';
import { TokenStore } from './token-store.service';
import { LOCAL_STORAGE, SESSION_STORAGE } from './browser-storage';

describe('TokenStore', () => {
  let store: TokenStore;
  let localStore: Storage;
  let sessionStore: Storage;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(TokenStore);
    localStore = TestBed.inject(LOCAL_STORAGE);
    sessionStore = TestBed.inject(SESSION_STORAGE);
  });

  it('guarda e devolve o access token só em memória', () => {
    expect(store.getAccessToken()).toBeNull();
    store.setAccessToken('access-1');
    expect(store.getAccessToken()).toBe('access-1');
    expect(localStore.getItem('erp-refresh-token')).toBeNull();
    expect(sessionStore.getItem('erp-refresh-token')).toBeNull();
  });

  it('persiste o refresh token em localStorage quando persist=true', () => {
    store.setRefreshToken('refresh-1', true);
    expect(localStore.getItem('erp-refresh-token')).toBe('refresh-1');
    expect(sessionStore.getItem('erp-refresh-token')).toBeNull();
    expect(store.getRefreshToken()).toBe('refresh-1');
    expect(store.hasRefreshToken()).toBe(true);
  });

  it('persiste o refresh token em sessionStorage quando persist=false', () => {
    store.setRefreshToken('refresh-2', false);
    expect(sessionStore.getItem('erp-refresh-token')).toBe('refresh-2');
    expect(localStore.getItem('erp-refresh-token')).toBeNull();
    expect(store.getRefreshToken()).toBe('refresh-2');
  });

  it('rotateRefreshToken mantém o storage originalmente escolhido', () => {
    store.setRefreshToken('refresh-1', true);
    store.rotateRefreshToken('refresh-rotated');
    expect(localStore.getItem('erp-refresh-token')).toBe('refresh-rotated');
    expect(sessionStore.getItem('erp-refresh-token')).toBeNull();

    store.setRefreshToken('refresh-2', false);
    store.rotateRefreshToken('refresh-rotated-2');
    expect(sessionStore.getItem('erp-refresh-token')).toBe('refresh-rotated-2');
    expect(localStore.getItem('erp-refresh-token')).toBeNull();
  });

  it('clear() limpa access token em memória e refresh token nos dois storages', () => {
    store.setAccessToken('access-1');
    store.setRefreshToken('refresh-1', true);
    store.clear();
    expect(store.getAccessToken()).toBeNull();
    expect(store.getRefreshToken()).toBeNull();
    expect(store.hasRefreshToken()).toBe(false);
  });
});
