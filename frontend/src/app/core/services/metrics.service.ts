import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

export interface PostMetric {
  id: string;
  content: string;
  views: number;
  likes: number;
  date: Date;
}

export interface EngagementTrend {
  labels: string[];
  data: number[];
}

export interface ChannelSummary {
  channelId: string;
  totalViews: number;
  totalLikes: number;
  topPosts: PostMetric[];
}

@Injectable({ providedIn: 'root' })
export class MetricsService {

  getChannelSummary(channelId: string): Observable<ChannelSummary> {
    // Mock data for UI development
    return of({
      channelId,
      totalViews: 45200,
      totalLikes: 3800,
      topPosts: [
        { id: '1', content: 'Exciting news coming soon!', views: 12500, likes: 1100, date: new Date(Date.now() - 86400000) },
        { id: '2', content: 'Our new AI feature is live.', views: 9800, likes: 850, date: new Date(Date.now() - 86400000 * 3) },
        { id: '3', content: 'Join our webinar tomorrow.', views: 7200, likes: 420, date: new Date(Date.now() - 86400000 * 5) }
      ]
    });
  }

  getEngagementTrend(channelId: string, timeframe: 'day' | 'week'): Observable<EngagementTrend> {
    if (timeframe === 'day') {
      return of({
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        data: [1200, 1900, 3000, 5000, 4200, 3800, 6000]
      });
    } else {
      return of({
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        data: [4.2, 4.5, 4.8, 5.2] // engagement rate percentages
      });
    }
  }
}
