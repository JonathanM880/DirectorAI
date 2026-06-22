import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppShellComponent } from './app-shell.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { BroadcastTickerComponent } from '../broadcast-ticker/broadcast-ticker.component';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';

describe('AppShellComponent', () => {
  let component: AppShellComponent;
  let fixture: ComponentFixture<AppShellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AppShellComponent,
        SidebarComponent,
        BroadcastTickerComponent,
        NotificationBellComponent,
        RouterTestingModule
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AppShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render sidebar', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const sidebar = compiled.querySelector('app-sidebar');
    expect(sidebar).toBeTruthy();
  });

  it('should render broadcast ticker', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const ticker = compiled.querySelector('app-broadcast-ticker');
    expect(ticker).toBeTruthy();
  });

  it('should render notification bell', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const bell = compiled.querySelector('app-notification-bell');
    expect(bell).toBeTruthy();
  });

  it('should render router outlet', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const outlet = compiled.querySelector('router-outlet');
    expect(outlet).toBeTruthy();
  });

  it('should have header with DirectorAI title', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const title = compiled.querySelector('.header h1');
    expect(title?.textContent).toBe('DirectorAI');
  });
});
