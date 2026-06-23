import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StudioComponent } from './studio.component';
import { GenAiService } from '../../core/services/gen-ai.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';

describe('StudioComponent', () => {
  let component: StudioComponent;
  let fixture: ComponentFixture<StudioComponent>;
  let mockGenAiService: any;
  let mockSupabase: any;

  beforeEach(async () => {
    mockGenAiService = {
      streamGenerate: jest.fn().mockReturnValue(of('Chunk1 ', 'Chunk2'))
    };

    mockSupabase = {
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'test_user' } } } })
      }
    };

    await TestBed.configureTestingModule({
      imports: [StudioComponent, FormsModule],
      providers: [
        { provide: GenAiService, useValue: mockGenAiService },
        { provide: SupabaseClient, useValue: mockSupabase }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display usage meter correctly', () => {
    component.usage.set(10);
    component.usageLimit.set(100);
    fixture.detectChanges();
    const meterElement = fixture.nativeElement.querySelector('.usage-meter');
    expect(meterElement.textContent).toContain('10/100');
  });

  it('should call streamGenerate and render output when generating', async () => {
    component.prompt.set('Test prompt');
    await component.generate();
    
    expect(mockGenAiService.streamGenerate).toHaveBeenCalled();
    expect(component.output()).toBe('Chunk1 Chunk2');
    
    fixture.detectChanges();
    const outputElement = fixture.nativeElement.querySelector('.output-content p');
    expect(outputElement.textContent).toBe('Chunk1 Chunk2');
  });

  it('should disable generate button while generating', () => {
    component.isGenerating.set(true);
    fixture.detectChanges();
    
    const btn = fixture.nativeElement.querySelector('button.btn-primary');
    expect(btn.disabled).toBeTruthy();
  });
});
