import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-automation',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <h2>Automation</h2>
      <p>Manage your automation and recurrence rules!</p>
    </div>
  `,
  styles: [`
    .page-container {
      h2 { margin: 0 0 var(--space-4); }
      p { color: var(--color-gray-300); }
    }
  `]
})
export class AutomationComponent {}
