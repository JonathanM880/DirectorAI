import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <h2>Metrics</h2>
      <p>View your analytics and performance data!</p>
    </div>
  `,
  styles: [`
    .page-container {
      h2 { margin: 0 0 var(--space-4); }
      p { color: var(--color-gray-300); }
    }
  `]
})
export class MetricsComponent {}
