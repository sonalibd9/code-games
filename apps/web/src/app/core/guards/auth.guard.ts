import { Injectable } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '@core/services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) return true;
  return router.createUrlTree(['/login']);
};

export const auditorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuditor()) return true;
  if (auth.isLoggedIn()) return router.createUrlTree(['/client/portal']);
  return router.createUrlTree(['/login']);
};

export const clientGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isClient()) return true;
  if (auth.isLoggedIn()) return router.createUrlTree(['/auditor/clients']);
  return router.createUrlTree(['/login']);
};
