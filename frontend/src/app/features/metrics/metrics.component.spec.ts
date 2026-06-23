import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MetricsComponent } from './metrics.component';
import { MetricsService, ChannelSummary, EngagementTrend } from '../../core/services/metrics.service';
import { of } from 'rxjs';

describe('MetricsComponent', () => {
  let component: MetricsComponent;
  let fixture: ComponentFixture<MetricsComponent>;
  let mockMetricsService: any;

  beforeEach(async () => {
    mockMetricsService = {
      getChannelSummary: jest.fn().mockReturnValue(of({
        channelId: 'telegram_main',
        totalViews: 1000,
        totalLikes: 100,
        topPosts: []
      })),
      getEngagementTrend: jest.fn().mockReturnValue(of({
        labels: ['A'],
        data: [1]
      }))
    };

    await TestBed.configureTestingModule({
      imports: [MetricsComponent],
      providers: [
        { provide: MetricsService, useValue: mockMetricsService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MetricsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load data on init', () => {
    expect(mockMetricsService.getChannelSummary).toHaveBeenCalledWith('telegram_main');
    expect(component.summary()?.totalViews).toBe(1000);
  });

  it('should reload data when channel changes', () => {
    component.onChannelChange('twitter_official');
    expect(mockMetricsService.getChannelSummary).toHaveBeenCalledWith('twitter_official');
  });
});
