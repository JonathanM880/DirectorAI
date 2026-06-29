import { Component } from '@angular/core';
import { TelegramIconComponent } from "@/shared/components/ui/telegram-icon/telegram-icon.component";

@Component({
  selector: 'app-chanel-grid',
  standalone: true,
  template: `

        <div class="grid grid-cols-2 border border-border rounded-3xl overflow-hidden bg-transparent">
          
          <div class="border-r border-b border-border py-4 px-8 flex items-center justify-center transition-colors hover:bg-white/[0.03]">
            <div class="flex items-center gap-4 text-white w-full max-w-lg">
              
              <div class="flex-shrink-0 w-8 h-8">
                <app-telegram-icon></app-telegram-icon>
              </div>

              <div class="flex flex-col gap-.5">
                <h2 class="text-xl font-bold tracking-wide">Name</h2>
                
                <span class="text-gray-300 text-sm">channel_identifier</span>
              </div>

            </div>
          </div>

          <div class="border-b border-border py-4 px-8  flex items-center justify-center transition-colors hover:bg-white/[0.03]">
            <div class="flex items-center gap-4 text-white w-full max-w-lg">
              
              <div class="flex-shrink-0 w-8 h-8">
                <app-telegram-icon></app-telegram-icon>
              </div>

              <div class="flex flex-col gap-.5">
                <h2 class="text-xl font-bold tracking-wide">Name</h2>
                
                <span class="text-gray-300 text-sm">channel_identifier</span>
              </div>

            </div>
          </div>

          <div class="border-r border-b border-border py-4 px-8 flex items-center justify-center transition-colors hover:bg-white/[0.03]">
            <div class="flex items-center gap-4 text-white w-full max-w-lg">
              
              <div class="flex-shrink-0 w-8 h-8">
                <app-telegram-icon></app-telegram-icon>
              </div>

              <div class="flex flex-col gap-.5">
                <h2 class="text-xl font-bold tracking-wide">Name</h2>
                
                <span class="text-gray-300 text-sm">channel_identifier</span>
              </div>

            </div>
          </div>

          <div class="border-b border-border py-4 px-8  flex items-center justify-center transition-colors hover:bg-white/[0.03]">
             <div class="flex items-center gap-4 text-white w-full max-w-lg">
              
              <div class="flex-shrink-0 w-8 h-8">
                <app-telegram-icon></app-telegram-icon>
              </div>

              <div class="flex flex-col gap-.5">
                <h2 class="text-xl font-bold tracking-wide">Name</h2>
                
                <span class="text-gray-300 text-sm">channel_identifier</span>
              </div>

            </div>
          </div>

          <div class="border-r border-border py-4 px-8 flex items-center justify-center transition-colors hover:bg-white/[0.03]">
            <div class="flex items-center gap-4 text-white w-full max-w-lg">
              
              <div class="flex-shrink-0 w-8 h-8">
                <app-telegram-icon></app-telegram-icon>
              </div>

              <div class="flex flex-col gap-.5">
                <h2 class="text-xl font-bold tracking-wide">Name</h2>
                
                <span class="text-gray-300 text-sm">channel_identifier</span>
              </div>

            </div>
          </div>

          <div class="py-4 px-8 flex items-center justify-center transition-colors hover:bg-white/[0.03]">
            <div class="flex items-center gap-4 text-white w-full max-w-lg">
              
              <div class="flex-shrink-0 w-8 h-8">
                <app-telegram-icon></app-telegram-icon>
              </div>

              <div class="flex flex-col gap-.5">
                <h2 class="text-xl font-bold tracking-wide">Name</h2>
                
                <span class="text-gray-300 text-sm">channel_identifier</span>
              </div>

            </div>
          </div>

        </div>
  `,
  imports: [TelegramIconComponent]
})
export class ChanelGridComponent {}