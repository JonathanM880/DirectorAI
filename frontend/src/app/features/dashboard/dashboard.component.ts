import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaxWidthHeightWrapperComponent } from "@/shared/components/ui/max-width-wrapper/max-width-wrapper.component";

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MaxWidthHeightWrapperComponent],
  template: `
    <div class="page-container">
      <app-max-width-height-wrapper>
        <h2>Dashboard</h2>
        <p>Welcome to your DirectorAI dashboard!</p>
      </app-max-width-height-wrapper>
    </div>
  `
})
export class DashboardComponent {}
