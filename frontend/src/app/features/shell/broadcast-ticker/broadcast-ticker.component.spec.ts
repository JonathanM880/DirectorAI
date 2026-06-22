import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BroadcastTickerComponent } from './broadcast-ticker.component';

describe('BroadcastTickerComponent', () => {
  let component: BroadcastTickerComponent;
  let fixture: ComponentFixture<BroadcastTickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BroadcastTickerComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(BroadcastTickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have 3 ticker items', () => {
    expect(component.tickerItems().length).toBe(3);
  });

  it('should display platform for each item', () => {
    component.tickerItems().forEach(item => {
      expect(item.platform).toBeTruthy();
    });
  });

  it('should display title for each item', () => {
    component.tickerItems().forEach(item => {
      expect(item.title).toBeTruthy();
    });
  });

  it('should toggle isPaused signal on hover', () => {
    expect(component.isPaused()).toBe(false);
    component.isPaused.set(true);
    expect(component.isPaused()).toBe(true);
    component.isPaused.set(false);
    expect(component.isPaused()).toBe(false);
  });

  it('should render ticker items in template', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const items = compiled.querySelectorAll('.ticker-item');
    // Items are duplicated for infinite scroll
    expect(items.length).toBe(6);
  });
});
