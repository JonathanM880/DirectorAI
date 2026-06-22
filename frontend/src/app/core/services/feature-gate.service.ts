import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';

export type Feature =
  | 'ai_generation'
  | 'asset_storage'
  | 'scheduled_posts'
  | 'recurrence_rules'
  | 'analytics'
  | 'multiple_channels';

interface FeatureAccessResponse {
  hasAccess: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class FeatureGateService {
  private readonly apiUrl = '/api/billing';

  constructor(private http: HttpClient) {}

  checkFeatureAccess(feature: Feature): Observable<boolean> {
    return this.http.get<FeatureAccessResponse>(`${this.apiUrl}/features/${feature}/access`).pipe(
      map(response => response.hasAccess),
      catchError(() => of(false))
    );
  }
}
