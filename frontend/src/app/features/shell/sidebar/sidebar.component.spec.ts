import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { SidebarComponent } from './sidebar.component';

describe('SidebarComponent', () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent, RouterTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have 7 nav items with correct paths', () => {
    expect(component.navItems.length).toBe(7);

    const paths = component.navItems.map(item => item.path);
    expect(paths).toContain('/dashboard');
    expect(paths).toContain('/studio');
    expect(paths).toContain('/assets');
    expect(paths).toContain('/calendar');
    expect(paths).toContain('/metrics');
    expect(paths).toContain('/automation');
    expect(paths).toContain('/settings');
  });

  it('should render all nav items', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const navItems = compiled.querySelectorAll('.nav-item');
    expect(navItems.length).toBe(7);
  });

  it('should display correct labels', () => {
    const expectedLabels = ['Dashboard', 'AI Studio', 'Assets', 'Calendar', 'Metrics', 'Automation', 'Settings'];
    const actualLabels = component.navItems.map(item => item.label);
    expect(actualLabels).toEqual(expectedLabels);
  });
});
