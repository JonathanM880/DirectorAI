import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusBadgeComponent } from './status-badge.component';

describe('StatusBadgeComponent', () => {
  let component: StatusBadgeComponent;
  let fixture: ComponentFixture<StatusBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusBadgeComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(StatusBadgeComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    component.status = 'published';
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should map published status to published class', () => {
    component.status = 'published';
    expect(component.statusClass).toBe('published');
  });

  it('should map scheduled status to scheduled class', () => {
    component.status = 'scheduled';
    expect(component.statusClass).toBe('scheduled');
  });

  it('should map failed status to failed class', () => {
    component.status = 'failed';
    expect(component.statusClass).toBe('failed');
  });

  it('should map retrying status to retrying class', () => {
    component.status = 'retrying';
    expect(component.statusClass).toBe('retrying');
  });

  it('should map publishing status to publishing class', () => {
    component.status = 'publishing';
    expect(component.statusClass).toBe('publishing');
  });

  it('should map cancelled status to cancelled class', () => {
    component.status = 'cancelled';
    expect(component.statusClass).toBe('cancelled');
  });

  it('should map unknown status to draft class', () => {
    component.status = 'unknown' as any;
    expect(component.statusClass).toBe('draft');
  });

  it('should render status in titlecase', () => {
    component.status = 'published';
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const badge = compiled.querySelector('.status-badge');
    expect(badge?.textContent?.trim()).toBe('Published');
  });
});
