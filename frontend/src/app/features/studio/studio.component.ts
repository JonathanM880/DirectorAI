import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-studio',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <h2>AI Studio</h2>
      <p>Generate amazing content with AI!</p>
    </div>
  `,
  styles: [`
    .page-container {
      h2 { margin: 0 0 var(--space-4); }
      p { color: var(--color-gray-300); }
    }
  `]
})
export class StudioComponent {}
