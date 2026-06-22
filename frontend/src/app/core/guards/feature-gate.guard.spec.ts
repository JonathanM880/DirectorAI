import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, UrlTree } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { FeatureGateGuard } from './feature-gate.guard';
import { FeatureGateService } from '../services/feature-gate.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = ReturnType<typeof jest.fn>;

function awaitResult(result: boolean | UrlTree | Observable<boolean | UrlTree> | Promise<boolean | UrlTree>): Promise<boolean | UrlTree> {
  if (result instanceof Observable) {
    return new Promise((resolve) => result.subscribe((v: any) => resolve(v)));
  }
  return Promise.resolve(result as boolean | UrlTree);
}

describe('FeatureGateGuard', () => {
  let guard: FeatureGateGuard;
  let router: Router;
  let featureGateService: { checkFeatureAccess: MockFn };

  beforeEach(() => {
    featureGateService = { checkFeatureAccess: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        FeatureGateGuard,
        { provide: FeatureGateService, useValue: featureGateService },
        provideRouter([])
      ]
    });

    guard = TestBed.inject(FeatureGateGuard);
    router = TestBed.inject(Router);
  });

  it('should allow access when route has no feature data', async () => {
    const route = { data: {} } as any;
    const result = await awaitResult(guard.canActivate(route, {} as any));
    expect(result).toBe(true);
  });

  it('should allow access when feature check returns true', async () => {
    (featureGateService.checkFeatureAccess as ReturnType<typeof jest.fn>).mockReturnValue(of(true));
    const route = { data: { feature: 'ai_generation' } } as any;

    const result = await awaitResult(guard.canActivate(route, {} as any));
    expect(result).toBe(true);
    expect(featureGateService.checkFeatureAccess).toHaveBeenCalledWith('ai_generation');
  });

  it('should redirect to billing when feature check returns false', async () => {
    (featureGateService.checkFeatureAccess as ReturnType<typeof jest.fn>).mockReturnValue(of(false));
    const route = { data: { feature: 'analytics' } } as any;
    const mockUrlTree = { commands: ['/settings/billing'] } as unknown as UrlTree;
    jest.spyOn(router, 'createUrlTree').mockReturnValue(mockUrlTree);

    const result = await awaitResult(guard.canActivate(route, {} as any));
    expect(result).toEqual(mockUrlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/settings/billing']);
  });

  it('should redirect to billing when feature check errors', async () => {
    (featureGateService.checkFeatureAccess as ReturnType<typeof jest.fn>).mockReturnValue(throwError(() => new Error('Network error')));
    const route = { data: { feature: 'recurrence_rules' } } as any;
    const mockUrlTree = { commands: ['/settings/billing'] } as unknown as UrlTree;
    jest.spyOn(router, 'createUrlTree').mockReturnValue(mockUrlTree);

    const result = await awaitResult(guard.canActivate(route, {} as any));
    expect(result).toEqual(mockUrlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/settings/billing']);
  });
});
