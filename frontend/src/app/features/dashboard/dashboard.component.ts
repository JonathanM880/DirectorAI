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
  imports: [
    CommonModule, 
    MaxWidthHeightWrapperComponent, 
    ChanelGridComponent, 
    HlmSkeleton, 
    ResizableGroupComponent, 
    ScrollAreaHorizontalPreview, 
    TablePreview
  ],
  template: `
    <div class="p-4 md:p-8 bg-background text-foreground min-h-screen">
      <app-max-width-height-wrapper>
        
        <div class="flex flex-col justify-center gap-10 w-full">
          
          <div>
            @if (profile()) {
              <h2 class="text-2xl font-bold">Bienvenido, {{ profile()?.displayName || profile()?.email }}</h2>
            } @else {
              <hlm-skeleton class="inline-block h-[20px] w-[300px] rounded-full"></hlm-skeleton>
            }
          </div>

          <div class="flex flex-wrap gap-8 w-full items-stretch">
            <div class="w-[500px] shrink-0 flex flex-col">
              <h3 class="text-xl font-semibold mb-4">Tus canales</h3>
              <app-chanel-grid class="flex-1"></app-chanel-grid>
            </div>

            <div class="flex-1 min-w-[500px] flex flex-col">
              <app-resizable-group class="flex-1"></app-resizable-group>
            </div>
          </div>

          <div class="flex flex-col gap-6 w-full items-start">
            <div class="w-full">
              <h3 class="text-xl font-semibold mb-4">Próximos post</h3>
              <spartan-scroll-area-horizontal-preview [type]="'upcoming'" class="w-full"></spartan-scroll-area-horizontal-preview>
            </div>
            
            <div class="w-full">
              <h3 class="text-xl font-semibold mb-4">Post publicados</h3>
              <spartan-scroll-area-horizontal-preview [type]="'published'" class="w-full"></spartan-scroll-area-horizontal-preview>
            </div>
          </div>

          <div class="w-full flex flex-col justify-center">
            <h3 class="text-xl font-semibold mb-4">Historial</h3>
            <spartan-table-preview class="w-full"></spartan-table-preview>
          </div>
          
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