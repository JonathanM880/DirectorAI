import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NotificationBellComponent } from './notification-bell.component';

describe('NotificationBellComponent', () => {
  let component: NotificationBellComponent;
  let fixture: ComponentFixture<NotificationBellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationBellComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationBellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have unread count of 1', () => {
    expect(component.unreadCount()).toBe(1);
  });

  it('should toggle dropdown', () => {
    expect(component.isDropdownOpen()).toBe(false);
    component.toggleDropdown();
    expect(component.isDropdownOpen()).toBe(true);
    component.toggleDropdown();
    expect(component.isDropdownOpen()).toBe(false);
  });

  it('should mark all notifications as read', () => {
    component.markAllAsRead();
    expect(component.unreadCount()).toBe(0);
    component.notifications().forEach(n => {
      expect(n.read).toBe(true);
    });
  });

  it('should render bell button', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const bellBtn = compiled.querySelector('.bell-btn');
    expect(bellBtn).toBeTruthy();
  });

  it('should show badge when there are unread notifications', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const badge = compiled.querySelector('.badge');
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe('1');
  });
});
