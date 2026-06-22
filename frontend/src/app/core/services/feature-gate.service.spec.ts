import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { FeatureGateService } from './feature-gate.service';

describe('FeatureGateService', () => {
  let service: FeatureGateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [FeatureGateService]
    });

    service = TestBed.inject(FeatureGateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return true when access is granted', () => {
    service.checkFeatureAccess('ai_generation').subscribe(result => {
      expect(result).toBe(true);
    });

    const req = httpMock.expectOne('/api/billing/features/ai_generation/access');
    expect(req.request.method).toBe('GET');
    req.flush({ hasAccess: true });
  });

  it('should return false when access is denied', () => {
    service.checkFeatureAccess('analytics').subscribe(result => {
      expect(result).toBe(false);
    });

    const req = httpMock.expectOne('/api/billing/features/analytics/access');
    expect(req.request.method).toBe('GET');
    req.flush({ hasAccess: false });
  });

  it('should return false on HTTP error', () => {
    service.checkFeatureAccess('recurrence_rules').subscribe(result => {
      expect(result).toBe(false);
    });

    const req = httpMock.expectOne('/api/billing/features/recurrence_rules/access');
    req.flush('Server error', { status: 500, statusText: 'Server Error' });
  });
});
