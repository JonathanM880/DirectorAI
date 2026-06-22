import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { AuthGuard } from './auth.guard';
import { AngularAuthService } from '../services/auth.service';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let router: Router;
  let authService: { authState$: any };

  beforeEach(() => {
    authService = { authState$: of(null) };

    TestBed.configureTestingModule({
      providers: [
        AuthGuard,
        { provide: AngularAuthService, useValue: authService },
        provideRouter([])
      ]
    });

    guard = TestBed.inject(AuthGuard);
    router = TestBed.inject(Router);
  });

  it('should allow access when user is authenticated', async () => {
    Object.defineProperty(authService, 'authState$', { get: () => of({ access_token: 'token' }) });

    const result = guard.canActivate({} as any, { url: '/dashboard' } as any);
    const value = await new Promise<any>((resolve) => {
      if (typeof result === 'object' && result !== null && 'subscribe' in result) {
        result.subscribe((v: any) => resolve(v));
      } else {
        resolve(result);
      }
    });
    expect(value).toBe(true);
  });

  it('should redirect to login when user is not authenticated', async () => {
    Object.defineProperty(authService, 'authState$', { get: () => of(null) });

    const mockUrlTree = { commands: ['/auth/login'] } as unknown as UrlTree;
    jest.spyOn(router, 'createUrlTree').mockReturnValue(mockUrlTree);

    const result = guard.canActivate({} as any, { url: '/dashboard' } as any);
    const urlTree = await new Promise<any>((resolve) => {
      if (typeof result === 'object' && result !== null && 'subscribe' in result) {
        result.subscribe((v: any) => resolve(v));
      } else {
        resolve(result);
      }
    });
    expect(urlTree).toEqual(mockUrlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/auth/login'], { queryParams: { returnUrl: '/dashboard' } });
  });
});
