import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssetsComponent } from './assets.component';
import { SupabaseClient } from '@supabase/supabase-js';

describe('AssetsComponent', () => {
  let component: AssetsComponent;
  let fixture: ComponentFixture<AssetsComponent>;
  let mockSupabase: any;

  beforeEach(async () => {
    mockSupabase = {};

    await TestBed.configureTestingModule({
      imports: [AssetsComponent],
      providers: [
        { provide: SupabaseClient, useValue: mockSupabase }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AssetsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle between grid and list views', () => {
    expect(component.viewMode()).toBe('grid');
    
    // Switch to list
    component.viewMode.set('list');
    fixture.detectChanges();
    
    let gridElement = fixture.nativeElement.querySelector('.asset-grid');
    let listElement = fixture.nativeElement.querySelector('.asset-list');
    
    expect(gridElement).toBeFalsy();
    expect(listElement).toBeTruthy();
  });

  it('should handle drag over state', () => {
    expect(component.isDraggingOver()).toBeFalsy();
    
    const dragEvent = new Event('dragover') as any;
    Object.defineProperty(dragEvent, 'preventDefault', { value: jest.fn() });
    Object.defineProperty(dragEvent, 'stopPropagation', { value: jest.fn() });
    
    component.onDragOver(dragEvent);
    expect(component.isDraggingOver()).toBeTruthy();
    
    component.onDragLeave(dragEvent);
    expect(component.isDraggingOver()).toBeFalsy();
  });
});
