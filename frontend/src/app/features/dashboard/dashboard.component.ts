import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaxWidthHeightWrapperComponent } from "@/shared/components/ui/max-width-wrapper/max-width-wrapper.component";
import { UsersProfileService } from '../../core/services/users-profile.service';
import { UserProfile } from '@director-ai/types';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MaxWidthHeightWrapperComponent],
  template: `
    <div class="page-container">
      <app-max-width-height-wrapper>
        @if (profile()) {
          <h2>Bienvenido, {{ profile()?.displayName || profile()?.email }}</h2>
        } @else {
          <h2>Bienvenido, Cargando...</h2>
        }
      </app-max-width-height-wrapper>
    </div>
  `
})
export class DashboardComponent implements OnInit {
  private usersProfileService = inject(UsersProfileService);
  
  profile = signal<UserProfile | null>(null);

  async ngOnInit() {
    const userProfile = await this.usersProfileService.getProfile();
    this.profile.set(userProfile);
  }
}