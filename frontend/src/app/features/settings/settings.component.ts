import { Component, OnInit, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaxWidthHeightWrapperComponent } from "@/shared/components/ui/max-width-wrapper/max-width-wrapper.component";
import { TelegramIconComponent } from "@/shared/components/ui/telegram-icon/telegram-icon.component";
import { XIconComponent } from "@/shared/components/ui/x-icon/x-icon.component";
import { ChannelsService } from '../../core/services/channels.service';
import { AuditLogService } from '../../core/services/audit-log.service';
import { Channel } from '@director-ai/types';
import { AuditLogEntry } from '../../features/services/scheduling-engine.service';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';
import { BrnPopoverImports } from '@spartan-ng/brain/popover';
import { HlmTableImports } from '@spartan-ng/helm/table';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaxWidthHeightWrapperComponent,
    TelegramIconComponent,
    XIconComponent,
    HlmButtonImports,
    HlmInputImports,
    HlmFieldImports,
    HlmPopoverImports,
    BrnPopoverImports,
    HlmTableImports
  ],
  template: `
    <div class="p-4 md:p-8 bg-background text-foreground min-h-screen">
      <app-max-width-height-wrapper>
        <div class="flex flex-col gap-8 w-full">
          <!-- Page Title -->
          <div>
            <h2 class="text-2xl font-bold text-white mb-6">Configuración</h2>
          </div>

          <!-- Section: Añadir Canales -->
          <div class="flex flex-col gap-4 w-full">
            <h3 class="text-xl font-semibold text-white">Añadir canales</h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 border border-border rounded-3xl overflow-hidden bg-transparent">
              <!-- Left Cell: Interactive Card to Add Channel (Telegram only for now) -->
              <hlm-popover align="center" #createPopover="brnPopover">
                <button hlmPopoverTrigger class="w-full h-full py-8 px-8 flex flex-col items-center justify-center gap-4 transition-colors hover:bg-white/[0.03] text-left outline-none border-none">
                  <div class="flex items-center gap-4 text-white w-full max-w-lg">
                    <div class="flex-shrink-0 w-12 h-12">
                      <app-telegram-icon></app-telegram-icon>
                    </div>
                    <div class="flex flex-col gap-1">
                      <h2 class="text-xl font-bold tracking-wide m-0">Telegram</h2>
                      <span class="text-gray-300 text-sm">Añadir canal de Telegram</span>
                    </div>
                  </div>
                </button>

                <hlm-popover-content *brnPopoverContent class="w-80 p-4 bg-background border border-border rounded-xl shadow-lg">
                  <h4 class="font-semibold text-lg text-white mb-2">Nuevo Canal</h4>
                  <p class="text-xs text-gray-400 mb-4">Ingresa los detalles para registrar tu canal de Telegram.</p>
                  
                  <form [formGroup]="createForm" (ngSubmit)="onCreateChannel(createPopover)" class="space-y-4">
                    <hlm-field-group class="space-y-3">
                      <hlm-field>
                        <label hlmFieldLabel for="new-name" class="text-xs text-gray-300 font-semibold">Nombre del Canal</label>
                        <input hlmInput type="text" id="new-name" placeholder="Mi Canal de Noticias" formControlName="name" class="w-full" />
                        <hlm-field-error validator="required">El nombre es requerido.</hlm-field-error>
                      </hlm-field>

                      <hlm-field>
                        <label hlmFieldLabel for="new-identifier" class="text-xs text-gray-300 font-semibold">Identificador de Telegram</label>
                        <input hlmInput type="text" id="new-identifier" placeholder="@mi_canal o id" formControlName="channelIdentifier" class="w-full" />
                        <hlm-field-error validator="required">El identificador es requerido.</hlm-field-error>
                      </hlm-field>
                    </hlm-field-group>

                    <button hlmBtn type="submit" [disabled]="createForm.invalid" class="w-full mt-2">Crear canal</button>
                  </form>
                </hlm-popover-content>
              </hlm-popover>

              <!-- Right Cell: Setup Instructions -->
              <div class="py-8 px-8 flex items-center justify-center bg-white/[0.01] border-t md:border-t-0 md:border-l border-border">
                <div class="text-gray-300 text-sm max-w-md space-y-2">
                  <h4 class="font-bold text-white text-base">Instrucciones de configuración:</h4>
                  <p class="leading-relaxed">
                    Para añadir tu canal de Telegram, primero debes invitar al bot <span class="font-mono text-cyan-400 font-semibold">@direcdirec_bot</span> a tu grupo/canal de Telegram, y luego otorgarle permisos de <span class="text-white font-semibold">Administrador</span> para que pueda publicar.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Section: Tus Canales & Audit Logs -->
          <div class="flex flex-col gap-4 w-full">
            <h3 class="text-xl font-semibold text-white">Tus canales</h3>

            <div class="flex flex-wrap gap-8 w-full items-stretch">
              <!-- Left Column: Configured Channels list -->
              <div class="w-[500px] shrink-0 flex flex-col">
                <div class="grid grid-cols-1 border border-border rounded-3xl overflow-hidden bg-transparent flex-1">
                  @for (channel of channels(); track channel.id; let i = $index) {
                    <div class="flex items-center justify-between border-b border-border last:border-b-0 hover:bg-white/[0.02] transition-colors p-4">
                      <!-- Left Half: Select Channel to Filter Logs -->
                      <button (click)="selectChannel(channel)"
                              class="flex items-center gap-4 text-white text-left flex-1 min-w-0 outline-none p-2 rounded-xl transition-colors border-none bg-transparent"
                              [class.bg-white/5]="selectedChannelId() === channel.id">
                        @if (channel.platform === 'telegram') {
                          <div class="flex-shrink-0 w-8 h-8">
                            <app-telegram-icon></app-telegram-icon>
                          </div>
                        } @else if (channel.platform === 'twitter') {
                          <div class="flex-shrink-0 w-8 h-8">
                            <app-x-icon></app-x-icon>
                          </div>
                        } @else {
                          <div class="flex-shrink-0 w-8 h-8 bg-white/10 rounded-full flex items-center justify-center font-semibold text-sm uppercase text-gray-300">
                            {{ channel.platform }}
                          </div>
                        }
                        <div class="flex flex-col gap-1 min-w-0">
                          <h2 class="text-lg font-bold tracking-wide truncate m-0">{{ channel.name }}</h2>
                          <span class="text-gray-300 text-xs truncate">{{ channel.channelIdentifier }}</span>
                          <span class="text-[9px] px-2 py-0.5 rounded w-fit inline-block font-semibold mt-1"
                                [class.bg-green-500/20]="channel.isActive" [class.text-green-400]="channel.isActive"
                                [class.bg-red-500/20]="!channel.isActive" [class.text-red-400]="!channel.isActive">
                            {{ channel.isActive ? 'Activo' : 'Inactivo' }}
                          </span>
                        </div>
                      </button>

                      <!-- Right Half: Options (Edit & Delete Popovers) -->
                      <div class="flex items-center gap-2 pl-4">
                        <!-- Edit Popover -->
                        <hlm-popover align="end" #editPopover="brnPopover">
                          <button hlmPopoverTrigger hlmBtn variant="outline" size="sm" class="h-8 px-2 text-xs" (click)="prepareEdit(channel)">Editar</button>
                          <hlm-popover-content *brnPopoverContent class="w-80 p-4 bg-background border border-border rounded-xl shadow-lg">
                            <h4 class="font-semibold text-white mb-2">Editar Canal</h4>
                            <form [formGroup]="editForm" (ngSubmit)="onUpdateChannel(channel.id, editPopover)" class="space-y-4">
                              <hlm-field-group class="space-y-3">
                                <hlm-field>
                                  <label hlmFieldLabel for="edit-name-{{channel.id}}" class="text-xs text-gray-300">Nombre del Canal</label>
                                  <input hlmInput type="text" id="edit-name-{{channel.id}}" formControlName="name" class="w-full" />
                                </hlm-field>
                                <hlm-field>
                                  <label hlmFieldLabel for="edit-identifier-{{channel.id}}" class="text-xs text-gray-300">Identificador</label>
                                  <input hlmInput type="text" id="edit-identifier-{{channel.id}}" formControlName="channelIdentifier" class="w-full" />
                                </hlm-field>
                                <div class="flex items-center gap-2 mt-2">
                                  <input type="checkbox" id="edit-active-{{channel.id}}" formControlName="isActive" class="rounded bg-background border-border text-primary focus:ring-0 focus:ring-offset-0" />
                                  <label for="edit-active-{{channel.id}}" class="text-xs text-gray-300 select-none cursor-pointer">Canal activo</label>
                                </div>
                              </hlm-field-group>
                              <button hlmBtn type="submit" [disabled]="editForm.invalid" class="w-full mt-2">Guardar cambios</button>
                            </form>
                          </hlm-popover-content>
                        </hlm-popover>

                        <!-- Delete Popover -->
                        <hlm-popover align="end" #deletePopover="brnPopover">
                          <button hlmPopoverTrigger hlmBtn variant="destructive" size="sm" class="h-8 px-2 text-xs">Eliminar</button>
                          <hlm-popover-content *brnPopoverContent class="w-64 p-4 bg-background border border-border rounded-xl shadow-lg">
                            <h4 class="font-semibold text-red-500 mb-1">¿Confirmar eliminación?</h4>
                            <p class="text-xs text-gray-400 mb-4">Esta acción eliminará el canal de forma permanente.</p>
                            <div class="flex gap-2">
                              <button hlmBtn variant="destructive" size="sm" class="flex-1" (click)="onDeleteChannel(channel.id, deletePopover)">Eliminar</button>
                            </div>
                          </hlm-popover-content>
                        </hlm-popover>
                      </div>
                    </div>
                  } @empty {
                    <div class="py-8 text-center text-gray-400 flex-1 flex items-center justify-center">
                      No hay canales configurados.
                    </div>
                  }
                </div>
              </div>

              <!-- Right Column: Audit Logs Table (filtered by selected channel) -->
              <div class="flex-1 min-w-[500px] flex flex-col border border-border rounded-3xl p-6 bg-transparent">
                <div class="flex items-center justify-between mb-4">
                  <h3 class="text-lg font-semibold text-white">
                    @if (selectedChannelId()) {
                      Historial del canal: <span class="text-primary">{{ getSelectedChannelName() }}</span>
                    } @else {
                      Historial global
                    }
                  </h3>
                  @if (selectedChannelId()) {
                    <button hlmBtn variant="link" size="sm" class="text-xs text-gray-400 hover:text-white" (click)="clearSelection()">
                      Ver todo
                    </button>
                  }
                </div>

                <!-- Table similar to spartan-table-preview -->
                <div hlmTableContainer class="border border-border rounded-2xl overflow-hidden bg-transparent w-full">
                  <table hlmTable class="w-full text-left border-collapse">
                    <thead hlmTableHeader class="bg-white/[0.02]">
                      <tr hlmTableRow>
                        <th hlmTableHead class="w-[150px] p-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Acción</th>
                        <th hlmTableHead class="p-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Plataforma</th>
                        <th hlmTableHead class="p-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Fecha</th>
                        <th hlmTableHead class="text-right p-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Código</th>
                      </tr>
                    </thead>
                    <tbody hlmTableBody>
                      @for (log of auditLogs(); track log.id) {
                        <tr hlmTableRow class="border-t border-border hover:bg-white/[0.01] transition-colors">
                          <td hlmTableCell class="font-medium p-3 text-white capitalize">{{ log.action }}</td>
                          <td hlmTableCell class="p-3 text-gray-300 uppercase text-xs">{{ log.platform || '-' }}</td>
                          <td hlmTableCell class="p-3 text-gray-300 text-xs">{{ log.occurredAt | date:'medium' }}</td>
                          <td hlmTableCell class="text-right font-mono text-xs p-3 text-gray-400">{{ log.errorCode || '-' }}</td>
                        </tr>
                      } @empty {
                        <tr hlmTableRow class="border-t border-border">
                          <td hlmTableCell [attr.colSpan]="4" class="text-center text-gray-400 py-8">
                            No hay registros en el historial.
                          </td>
                        </tr>
                      }
                    </tbody>
                    <tfoot hlmTableFooter class="bg-white/[0.01]">
                      <tr hlmTableRow class="border-t border-border">
                        <td hlmTableCell [attr.colSpan]="3" class="p-3 text-xs text-gray-400 font-semibold">Total registros</td>
                        <td hlmTableCell class="text-right p-3 text-xs text-white font-semibold">{{ totalLogs() }}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </app-max-width-height-wrapper>
    </div>

    <!-- Toast Alert Banner -->
    @if (toast(); as t) {
      <div class="fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-sm font-semibold z-[999999] animate-in slide-in-from-bottom-4" [class.bg-[#00E676]]="t.type === 'success'" [class.text-black]="t.type === 'success'" [class.bg-red-500]="t.type === 'error'" [class.text-white]="t.type === 'error'" role="status" aria-live="polite">
        {{ t.message }}
      </div>
    }
  `,
  styles: []
})
export class SettingsComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private channelsService = inject(ChannelsService);
  private auditLogService = inject(AuditLogService);

  channels = signal<Channel[]>([]);
  auditLogs = signal<AuditLogEntry[]>([]);
  totalLogs = signal<number>(0);
  selectedChannelId = signal<string | null>(null);

  // Toast status
  toast = signal<{ message: string; type: 'success' | 'error' } | null>(null);
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  createForm: FormGroup = this.fb.group({
    name: ['', [Validators.required]],
    channelIdentifier: ['', [Validators.required]]
  });

  editForm: FormGroup = this.fb.group({
    name: ['', [Validators.required]],
    channelIdentifier: ['', [Validators.required]],
    isActive: [true]
  });

  async ngOnInit() {
    await this.loadChannels();
    await this.loadAuditLogs();
  }

  ngOnDestroy() {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
  }

  showToast(message: string, type: 'success' | 'error') {
    this.toast.set({ message, type });
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = setTimeout(() => this.toast.set(null), 3500);
  }

  async loadChannels() {
    try {
      const data = await this.channelsService.getChannels();
      this.channels.set(data);
    } catch (error) {
      console.error('Error loading channels:', error);
    }
  }

  async loadAuditLogs() {
    try {
      const channelId = this.selectedChannelId() || undefined;
      const result = await this.auditLogService.getAuditLog({
        page: 0,
        pageSize: 10,
        channelId
      });
      this.auditLogs.set(result.rows);
      this.totalLogs.set(result.total);
    } catch (error) {
      console.error('Error loading audit logs:', error);
    }
  }

  async onCreateChannel(popover: any) {
    if (this.createForm.invalid) return;

    try {
      const { name, channelIdentifier } = this.createForm.value;
      // Normalise channel identifier (ensure it has @ if it doesn't and is not an ID)
      let identifier = channelIdentifier.trim();
      if (!identifier.startsWith('@') && isNaN(Number(identifier))) {
        identifier = '@' + identifier;
      }

      await this.channelsService.createChannel({
        platform: 'telegram',
        name: name.trim(),
        channel_identifier: identifier,
        is_active: true
      });

      this.showToast('Canal de Telegram creado con éxito.', 'success');
      popover.close();
      this.createForm.reset();
      await this.loadChannels();
    } catch (error: any) {
      console.error('Error creating channel:', error);
      this.showToast('Error al crear canal: ' + (error?.message || error), 'error');
    }
  }

  prepareEdit(channel: Channel) {
    this.editForm.patchValue({
      name: channel.name,
      channelIdentifier: channel.channelIdentifier,
      isActive: channel.isActive
    });
  }

  async onUpdateChannel(id: string, popover: any) {
    if (this.editForm.invalid) return;

    try {
      const { name, channelIdentifier, isActive } = this.editForm.value;
      let identifier = channelIdentifier.trim();
      if (!identifier.startsWith('@') && isNaN(Number(identifier))) {
        identifier = '@' + identifier;
      }

      await this.channelsService.updateChannel(id, {
        name: name.trim(),
        channel_identifier: identifier,
        is_active: isActive
      });

      this.showToast('Canal actualizado con éxito.', 'success');
      popover.close();
      await this.loadChannels();
    } catch (error: any) {
      console.error('Error updating channel:', error);
      this.showToast('Error al actualizar canal: ' + (error?.message || error), 'error');
    }
  }

  async onDeleteChannel(id: string, popover: any) {
    try {
      await this.channelsService.deleteChannel(id);
      if (this.selectedChannelId() === id) {
        this.selectedChannelId.set(null);
      }
      this.showToast('Canal eliminado con éxito.', 'success');
      popover.close();
      await this.loadChannels();
      await this.loadAuditLogs();
    } catch (error: any) {
      console.error('Error deleting channel:', error);
      this.showToast('Error al eliminar canal: ' + (error?.message || error), 'error');
    }
  }

  selectChannel(channel: Channel) {
    if (this.selectedChannelId() === channel.id) {
      this.clearSelection();
    } else {
      this.selectedChannelId.set(channel.id);
      this.loadAuditLogs();
    }
  }

  clearSelection() {
    this.selectedChannelId.set(null);
    this.loadAuditLogs();
  }

  getSelectedChannelName(): string {
    const ch = this.channels().find(c => c.id === this.selectedChannelId());
    return ch ? ch.name : '';
  }
}
