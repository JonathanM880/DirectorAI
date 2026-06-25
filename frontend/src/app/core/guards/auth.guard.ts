import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
// removed RxJS imports that are no longer needed
import { AngularAuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(private authService: AngularAuthService, private router: Router) {}

  async canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<boolean | UrlTree> {
    const session = await this.authService.getSession();
    if (session) {
      return true;
    }
    return this.router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
  }
}
