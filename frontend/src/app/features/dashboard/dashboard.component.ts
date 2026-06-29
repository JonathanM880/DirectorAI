import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaxWidthHeightWrapperComponent } from "@/shared/components/ui/max-width-wrapper/max-width-wrapper.component";
import { UsersProfileService } from '../../core/services/users-profile.service';
import { UserProfile } from '@director-ai/types';
import { ChanelGridComponent } from "./ChanelGrid/chanelgrid.component";
import { HlmSkeleton } from '@spartan-ng/helm/skeleton';
import { ResizableGroupComponent } from "./ResizableGroup/resizable-group.component";
import { ScrollAreaHorizontalPreview } from "./ScrollAreaHorizontalPreview/scroll-area-horizontal-preview.component";
import { TablePreview } from "./Table/table.component";


@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MaxWidthHeightWrapperComponent, ChanelGridComponent, HlmSkeleton, ResizableGroupComponent, ScrollAreaHorizontalPreview, TablePreview],
  template: `
    <div class="page-container">
      <app-max-width-height-wrapper>
        @if (profile()) {
          <h2>Bienvenido, {{ profile()?.displayName || profile()?.email }}</h2>
        } @else {
          <hlm-skeleton class="inline-block h-[20px] w-[300px] rounded-full"></hlm-skeleton>
        }

        <div style="display: flex;">
          <div>
            <app-chanel-grid></app-chanel-grid>
          </div>

          <div style="display: flex; flex-direction: column;">
            <div>
              
              <app-resizable-group></app-resizable-group>

            </div>
          </div>
        </div>

        <div>
          <spartan-scroll-area-horizontal-preview></spartan-scroll-area-horizontal-preview>
          <spartan-scroll-area-horizontal-preview></spartan-scroll-area-horizontal-preview>
        </div>

        <div>
          <spartan-table-preview></spartan-table-preview>
        </div>
        
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