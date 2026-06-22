import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <h2>Dashboard</h2>
      <p>Welcome to your DirectorAI dashboard!</p>
    </div>
  `,
  styles: [`
    .page-container {
      h2 { margin: 0 0 var(--space-4); }
      p { color: var(--color-gray-300); }
    }
  `]
})
export class DashboardComponent {}
