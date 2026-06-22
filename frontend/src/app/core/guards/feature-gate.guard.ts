import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { Observable, map, catchError, of } from 'rxjs';
import { FeatureGateService } from '../services/feature-gate.service';

export type Feature =
  | 'ai_generation'
  | 'asset_storage'
  | 'scheduled_posts'
  | 'recurrence_rules'
  | 'analytics'
  | 'multiple_channels';

@Injectable({
  providedIn: 'root'
})
export class FeatureGateGuard implements CanActivate {
  constructor(
    private featureGateService: FeatureGateService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
    const feature = route.data['feature'] as Feature | undefined;

    if (!feature) {
      return true;
    }

    return this.featureGateService.checkFeatureAccess(feature).pipe(
      map(hasAccess => {
        if (hasAccess) {
          return true;
        }
        return this.router.createUrlTree(['/settings/billing']);
      }),
      catchError(() => of(this.router.createUrlTree(['/settings/billing'])))
    );
  }
}
