import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Session, AuthUser } from '@core/models/types';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _session = signal<Session | null>(null);

  readonly session = this._session.asReadonly();
  readonly isLoggedIn = computed(() => this._session() !== null);
  readonly currentUser = computed(() => this._session()?.user ?? null);
  readonly token = computed(() => this._session()?.token ?? null);
  readonly isAuditor = computed(() => this._session()?.user.role === 'auditor');
  readonly isClient = computed(() => this._session()?.user.role === 'client');

  constructor(private router: Router) {}

  setSession(loginData: { token: string; user: AuthUser }): void {
    this._session.set({ token: loginData.token, user: loginData.user });
  }

  clearSession(): void {
    this._session.set(null);
  }
}
