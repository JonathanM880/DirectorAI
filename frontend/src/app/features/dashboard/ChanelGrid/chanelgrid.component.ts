import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ChannelsService } from '../../../core/services/channels.service';
import { Channel } from '@director-ai/types';
import { TelegramIconComponent } from '@/shared/components/ui/telegram-icon/telegram-icon.component';
import { XIconComponent } from '@/shared/components/ui/x-icon/x-icon.component';

@Component({
  selector: 'app-chanel-grid',
  standalone: true,
  imports: [CommonModule, TelegramIconComponent, XIconComponent, RouterLink],
  template: `
    <a routerLink="/app/settings" class="block w-full no-underline text-inherit">
      <div
        class="grid grid-cols-2 border border-border rounded-3xl overflow-hidden bg-transparent transition-colors hover:bg-white/[0.02]"
      >
        @for (channel of channels(); track channel.id; let i = $index) {
          <div
            class="py-4 px-8 flex items-center justify-center transition-colors hover:bg-white/[0.03]"
            [class.border-r]="i % 2 === 0"
            [class.border-b]="
              i < (channels().length % 2 === 0 ? channels().length - 2 : channels().length - 1)
            "
          >
            <div class="flex items-center gap-4 text-white w-full max-w-lg">
              @if (channel.platform === 'telegram') {
                <div class="flex-shrink-0 w-8 h-8">
                  <app-telegram-icon></app-telegram-icon>
                </div>
              } @else if (channel.platform === 'twitter') {
                <div class="flex-shrink-0 w-8 h-8">
                  <app-x-icon></app-x-icon>
                </div>
              } @else {
                <div
                  class="flex-shrink-0 w-8 h-8 bg-white/10 rounded-full flex items-center justify-center font-semibold text-sm uppercase text-gray-300"
                >
                  {{ channel.platform }}
                </div>
              }
              <div class="flex flex-col gap-1">
                <h2 class="text-xl font-bold tracking-wide">{{ channel.name }}</h2>
                <span class="text-gray-300 text-sm">&#64;{{ channel.channelIdentifier }}</span>
                <span
                  class="text-[10px] px-2 py-0.5 rounded w-fit inline-block font-semibold mt-1"
                  [class.bg-green-500/20]="channel.isActive"
                  [class.text-green-400]="channel.isActive"
                  [class.bg-red-500/20]="!channel.isActive"
                  [class.text-red-400]="!channel.isActive"
                >
                  {{ channel.isActive ? 'Activo' : 'Inactivo' }}
                </span>
              </div>
            </div>
          </div>
        } @empty {
          <div class="col-span-2 py-8 text-center text-gray-400">No hay canales.</div>
        }
      </div>
    </a>
  `,
})
export class ChanelGridComponent implements OnInit {
  private channelsService = inject(ChannelsService);
  channels = signal<Channel[]>([]);

  async ngOnInit() {
    try {
      const data = await this.channelsService.getChannels();
      this.channels.set(data);
    } catch (error) {
      console.error('Error loading channels:', error);
    }
  }
}