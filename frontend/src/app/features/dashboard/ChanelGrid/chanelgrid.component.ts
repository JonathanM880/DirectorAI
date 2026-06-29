import { Component } from '@angular/core';
import { TelegramIconComponent } from "@/shared/components/ui/telegram-icon/telegram-icon.component";

@Component({
  selector: 'app-chanel-grid',
  standalone: true,
  template: `

        <div class="grid grid-cols-2 gap-[2px]">
          
          <div class="bg-gray-500/50 py-4 px-8 flex items-center justify-center transition-colors hover:bg-gray-400/50 rounded-tl-3xl">
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

          <div class="bg-gray-500/50 py-4 px-8  flex items-center justify-center transition-colors hover:bg-gray-400/50 rounded-tr-3xl">
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

          <div class="bg-gray-500/50 py-4 px-8 flex items-center justify-center transition-colors hover:bg-gray-400/50">
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

          <div class="bg-gray-500/50 py-4 px-8  flex items-center justify-center transition-colors hover:bg-gray-400/50">
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

          <div class="bg-gray-500/50 py-4 px-8 flex items-center justify-center transition-colors hover:bg-gray-400/50 rounded-bl-3xl">
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

          <div class="bg-gray-500/50 py-4 px-8 flex items-center justify-center transition-colors hover:bg-gray-400/50 rounded-br-3xl">
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