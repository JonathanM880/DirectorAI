import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <h2>Settings</h2>
      <p>Manage your account and billing settings!</p>
    </div>
  `,
  styles: [`
    .page-container {
      h2 { margin: 0 0 var(--space-4); }
      p { color: var(--color-gray-300); }
    }
  `]
})
export class SettingsComponent {}
