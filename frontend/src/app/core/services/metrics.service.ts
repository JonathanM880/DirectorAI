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
    throw new Error('Not Implemented: Real API integration required for Channel Summary.');
  }

  getEngagementTrend(channelId: string, timeframe: 'day' | 'week'): Observable<EngagementTrend> {
    throw new Error('Not Implemented: Real API integration required for Engagement Trend.');
  }
}
