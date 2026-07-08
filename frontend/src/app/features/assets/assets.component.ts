import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { SupabaseClient } from '@supabase/supabase-js';
import FilerobotImageEditor from 'filerobot-image-editor';
import { NotificationService } from '../../core/services/notification.service';
import { AssetUploadService, UploadedAsset } from '../../core/services/asset-upload.service';
import { PostFormComponent, PostFormData } from '../../shared/components/post-form/post-form.component';
import { MaxWidthHeightWrapperComponent } from "@/shared/components/ui/max-width-wrapper/max-width-wrapper.component";

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, MaxWidthHeightWrapperComponent, PostFormComponent],
  template: `
    <div class="p-4 md:p-8 bg-background text-foreground min-h-screen">
      <app-max-width-height-wrapper>
        <div class="flex flex-col gap-8 w-full">
          <!-- Page Title & Header Actions -->
          <div class="flex justify-between items-center flex-wrap gap-4">
            <h2 class="text-2xl font-bold text-white">Recursos</h2>
            
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-3 bg-white/5 px-4 py-1.5 rounded-full text-sm" *ngIf="selectedCount() > 0">
                <span>{{ selectedCount() }} seleccionado(s)</span>
                <button class="px-3 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-secondary text-secondary-foreground text-sm">Mover</button>
                <button class="px-3 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-destructive text-destructive-foreground text-sm">Eliminar</button>
              </div>
              
              <div class="flex gap-1 bg-secondary p-1 rounded-lg">
                <button class="bg-transparent border-none text-muted-foreground px-3 py-1.5 rounded cursor-pointer" [class.bg-white/10]="viewMode() === 'grid'" [class.text-foreground]="viewMode() === 'grid'" (click)="viewMode.set('grid')">▦</button>
                <button class="bg-transparent border-none text-muted-foreground px-3 py-1.5 rounded cursor-pointer" [class.bg-white/10]="viewMode() === 'list'" [class.text-foreground]="viewMode() === 'list'" (click)="viewMode.set('list')">☰</button>
              </div>

              <button class="px-4 py-2.5 rounded-md border-none cursor-pointer font-semibold bg-primary text-primary-foreground" (click)="fileInput.click()">Subir archivos</button>
              <input type="file" #fileInput multiple hidden (change)="onFileSelected($event)">
            </div>
          </div>

          <div class="flex flex-wrap gap-8 w-full items-stretch">
            <!-- Left Card: Filters -->
            <div class="w-full md:w-[280px] shrink-0 flex flex-col border border-border rounded-3xl p-6 bg-transparent">
              <div class="flex flex-col gap-2">
                <div class="px-3 py-2.5 rounded-md cursor-pointer flex items-center gap-3 text-muted-foreground transition-colors hover:bg-white/5" [class.bg-white/5]="activeFilter() === 'All Files'" [class.text-white]="activeFilter() === 'All Files'" [class.font-semibold]="activeFilter() === 'All Files'" (click)="setFilter('All Files')">
                  <span>📁</span> Todos los archivos
                </div>
                <div class="px-3 py-2.5 rounded-md cursor-pointer flex items-center gap-3 text-muted-foreground transition-colors hover:bg-white/5" [class.bg-white/5]="activeFilter() === 'Images'" [class.text-white]="activeFilter() === 'Images'" [class.font-semibold]="activeFilter() === 'Images'" (click)="setFilter('Images')">
                  <span>📁</span> Imágenes
                </div>
                <div class="px-3 py-2.5 rounded-md cursor-pointer flex items-center gap-3 text-muted-foreground transition-colors hover:bg-white/5" [class.bg-white/5]="activeFilter() === 'Videos'" [class.text-white]="activeFilter() === 'Videos'" [class.font-semibold]="activeFilter() === 'Videos'" (click)="setFilter('Videos')">
                  <span>📁</span> Vídeos
                </div>
                <div class="px-3 py-2.5 rounded-md cursor-pointer flex items-center gap-3 text-muted-foreground transition-colors hover:bg-white/5" [class.bg-white/5]="activeFilter() === 'Documents'" [class.text-white]="activeFilter() === 'Documents'" [class.font-semibold]="activeFilter() === 'Documents'" (click)="setFilter('Documents')">
                  <span>📁</span> Documentos
                </div>
              </div>
            </div>

            <!-- Right Card: Files display -->
            <div class="flex-1 min-w-[320px] md:min-w-[500px] flex flex-col border border-border rounded-3xl p-6 bg-transparent min-h-[450px] relative"
                 [class.bg-primary/5]="isDraggingOver()"
                 cdkDropList
                 (cdkDropListDropped)="onFileDropped($event)"
                 (dragover)="onDragOver($event)"
                 (dragleave)="onDragLeave($event)"
                 (drop)="onNativeDrop($event)">
              
              <div class="absolute inset-0 bg-black/90 backdrop-blur-sm z-10 flex items-center justify-center border-2 border-dashed border-primary rounded-3xl pointer-events-none" *ngIf="isDraggingOver()">
                <div class="text-center">
                  <h3 class="text-primary mb-2 text-xl font-bold">Suelta los archivos aquí para subirlos</h3>
                  <p class="text-muted-foreground">Imágenes, vídeos y documentos de hasta 50 MB</p>
                </div>
              </div>

              <!-- Grid View -->
              <div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4" *ngIf="viewMode() === 'grid'">
                <div class="bg-white/5 border border-border rounded-2xl overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5 hover:border-white/20" *ngFor="let asset of filteredAssets" (click)="openPreview(asset)">
                  <div class="h-[140px] bg-black/20 relative flex items-center justify-center">
                    <span class="absolute top-2 right-2 bg-black/60 px-2 py-0.5 rounded text-xs font-semibold" [class.bg-primary]="asset.source === 'ai_generated'" [class.text-primary-foreground]="asset.source === 'ai_generated'">
                      {{ asset.source === 'ai_generated' ? 'IA' : 'Subido' }}
                    </span>
                    <img *ngIf="asset.type === 'image'" [src]="asset.preview" alt="Preview" class="w-full h-full object-cover">
                    <div *ngIf="asset.type !== 'image'" class="text-5xl">📄</div>
                  </div>
                  <div class="p-3">
                    <div class="font-medium whitespace-nowrap overflow-hidden text-ellipsis mb-1 text-white">{{ asset.filename }}</div>
                    <div class="text-xs text-muted-foreground">{{ asset.date | date:'shortDate' }} • {{ asset.size }}</div>
                  </div>
                </div>
              </div>

              <!-- List View -->
              <div *ngIf="viewMode() === 'list'" class="w-full overflow-hidden border border-border rounded-2xl bg-transparent">
                <table class="w-full border-collapse text-left">
                  <thead class="bg-white/[0.02] border-b border-border">
                    <tr>
                      <th class="px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider w-[50px]"><input type="checkbox"></th>
                      <th class="px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Nombre</th>
                      <th class="px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Tipo</th>
                      <th class="px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Origen</th>
                      <th class="px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Tamaño</th>
                      <th class="px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Fecha añadido</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let asset of filteredAssets" (click)="openPreview(asset)" class="cursor-pointer border-t border-border hover:bg-white/[0.01] transition-colors">
                      <td class="px-4 py-3 text-white" (click)="$event.stopPropagation()"><input type="checkbox"></td>
                      <td class="px-4 py-3 text-white font-medium">{{ asset.filename }}</td>
                      <td class="px-4 py-3 text-gray-300 text-xs">{{ translateType(asset.type) }}</td>
                      <td class="px-4 py-3 text-gray-300 text-xs">{{ translateSource(asset.source) }}</td>
                      <td class="px-4 py-3 text-gray-300 text-xs">{{ asset.size }}</td>
                      <td class="px-4 py-3 text-gray-300 text-xs">{{ asset.date | date:'short' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </app-max-width-height-wrapper>
    </div>

        
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-10" *ngIf="previewAsset()" (click)="closePreview()">
          <div class="bg-background border border-border rounded-xl max-w-4xl w-full relative overflow-hidden flex flex-col" (click)="$event.stopPropagation()">
            <button class="absolute top-4 right-4 bg-black/50 hover:bg-black/70 transition-colors text-white text-2xl w-8 h-8 rounded-full flex items-center justify-center z-10 border-none cursor-pointer" (click)="closePreview()">×</button>
            
            <ng-container *ngIf="!isEditing()">
              <img *ngIf="previewAsset()?.type === 'image'" [src]="previewAsset().preview" class="w-full max-h-[60vh] object-contain bg-black">
              <video *ngIf="previewAsset()?.type === 'video'" controls class="w-full max-h-[60vh] object-contain bg-black">
                <source src="https://www.w3schools.com/html/mov_bbb.mp4" type="video/mp4">
              </video>
              <div *ngIf="previewAsset()?.type === 'document'" class="p-8 max-h-[60vh] overflow-y-auto bg-background text-foreground">
                <p *ngIf="!previewAsset().textContent">Cargando contenido de texto...</p>
                <pre *ngIf="previewAsset().textContent" class="whitespace-pre-wrap font-inherit m-0 leading-relaxed">{{ previewAsset().textContent }}</pre>
              </div>
              
              <div class="p-5 bg-background border-t border-border">
                <div class="flex justify-between items-center">
                  <div>
                    <h3 class="m-0 mb-2 font-display font-bold text-xl">{{ previewAsset().filename }}</h3>
                    <p class="m-0 text-muted-foreground text-sm">{{ previewAsset().size }} • {{ translateSource(previewAsset().source) }}</p>
                  </div>
                  <div class="flex gap-2" *ngIf="previewAsset()?.type !== 'video'">
                    <button class="px-3 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-secondary text-secondary-foreground text-sm" (click)="openScheduleForm()">Programar</button>
                    <button class="px-3 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-secondary text-secondary-foreground text-sm" (click)="renameAsset(previewAsset())">Renombrar</button>
                    <button class="px-3 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-secondary text-secondary-foreground text-sm" (click)="startEditing()">Editar</button>
                    <button class="px-3 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-destructive text-destructive-foreground text-sm" (click)="deleteAsset(previewAsset())">Eliminar</button>
                  </div>
                  <div class="flex gap-2" *ngIf="previewAsset()?.type === 'video'">
                    <button class="px-3 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-secondary text-secondary-foreground text-sm" (click)="openScheduleForm()">Programar</button>
                    <button class="px-3 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-secondary text-secondary-foreground text-sm" (click)="renameAsset(previewAsset())">Renombrar</button>
                    <button class="px-3 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-destructive text-destructive-foreground text-sm" (click)="deleteAsset(previewAsset())">Eliminar</button>
                  </div>
                </div>
              </div>
            </ng-container>

            <!-- Text Editor -->
            <div class="flex flex-col w-full h-[70vh] bg-background" *ngIf="isEditing() && previewAsset()?.type === 'document'">
              <div class="p-4 border-b border-border">
                <input class="w-full px-3 py-2 bg-black/20 border border-border rounded-md text-foreground font-inherit outline-none focus:border-primary" [(ngModel)]="editFilename" placeholder="Nombre de archivo">
              </div>
              <textarea class="flex-1 p-5 bg-transparent border-none text-foreground font-mono resize-none leading-relaxed outline-none" [(ngModel)]="editTextContent"></textarea>
              <div class="p-4 border-t border-border flex justify-end gap-3">
                <button class="px-4 py-2.5 rounded-md border-none cursor-pointer font-semibold bg-secondary text-secondary-foreground" (click)="cancelEditing()">Cancelar</button>
                <button class="px-4 py-2.5 rounded-md border-none cursor-pointer font-semibold bg-primary text-primary-foreground" (click)="saveTextEdit(false)">Sobrescribir original</button>
                <button class="px-4 py-2.5 rounded-md border-none cursor-pointer font-semibold bg-primary text-primary-foreground" (click)="saveTextEdit(true)">Guardar como nuevo</button>
              </div>
            </div>

            <!-- Image Editor Container -->
            <div class="flex flex-col w-full h-[70vh] bg-background" *ngIf="isEditing() && previewAsset()?.type === 'image'">
              <div id="filerobot-editor" style="width: 100%; height: 100%;"></div>
            </div>
          </div>
        </div>

      <!-- Schedule Form Modal -->
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center animate-in fade-in duration-150" *ngIf="scheduleFormOpen()" (click)="scheduleFormOpen.set(false)" role="dialog" aria-modal="true" aria-label="Programar publicación">
        <div class="bg-background border border-white/10 rounded-xl shadow-2xl w-[900px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-4rem)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 duration-200" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between p-5 md:px-6 border-b border-white/10 shrink-0">
            <h2 class="m-0 text-lg font-display uppercase tracking-wider text-foreground">Programar publicación</h2>
            <button class="w-8 h-8 flex items-center justify-center bg-white/5 border-none rounded-md text-muted-foreground cursor-pointer hover:bg-white/10 hover:text-foreground transition-all" (click)="scheduleFormOpen.set(false)" aria-label="Cerrar">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto p-6 pb-0">
            <app-post-form
              [initialText]="initialTextForForm"
              [initialAssets]="initialAssetsForForm"
              (saved)="onScheduleSaved($event)"
              (cancel)="scheduleFormOpen.set(false)">
            </app-post-form>
          </div>
        </div>
      </div>
  `
})
export class AssetsComponent implements OnInit {
  private supabase = inject(SupabaseClient);
  private notificationService = inject(NotificationService);
  private assetUpload = inject(AssetUploadService);

  viewMode = signal<'grid' | 'list'>('grid');
  isDraggingOver = signal(false);
  selectedCount = signal(0);
  activeFilter = signal('All Files');
  previewAsset = signal<any>(null);
  
  isEditing = signal(false);
  editFilename = '';
  editTextContent = '';
  private imageEditorInstance: any = null;

  initialTextForForm = '';
  initialAssetsForForm: UploadedAsset[] = [];
  scheduleFormOpen = signal(false);
  isScheduling = signal(false);

  // Mock data for UI layout
  mockAssets = signal<any[]>([
    { id: '1', filename: 'summer_promo.jpg', type: 'image', source: 'user_upload', size: '2.4 MB', date: new Date(), preview: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400', mime_type: 'image/jpeg', size_bytes: 2516582, storage_path: 'mock/summer_promo.jpg' },
    { id: '2', filename: 'ai_generated_copy_1.txt', type: 'document', source: 'ai_generated', size: '1.2 KB', date: new Date(), mime_type: 'text/plain', size_bytes: 1228, storage_path: 'mock/ai_generated_copy_1.txt' },
    { id: '3', filename: 'product_video_raw.mp4', type: 'video', source: 'user_upload', size: '45.1 MB', date: new Date(), mime_type: 'video/mp4', size_bytes: 47290778, storage_path: 'mock/product_video_raw.mp4' }
  ]);

  get filteredAssets() {
    const filter = this.activeFilter();
    if (filter === 'All Files') return this.mockAssets();
    if (filter === 'Images') return this.mockAssets().filter(a => a.type === 'image');
    if (filter === 'Videos') return this.mockAssets().filter(a => a.type === 'video');
    if (filter === 'Documents') return this.mockAssets().filter(a => a.type === 'document');
    return this.mockAssets();
  }

  ngOnInit() {
    this.loadAssets();
  }

  setFilter(filter: string) {
    this.activeFilter.set(filter);
  }

  async openPreview(asset: any) {
    this.previewAsset.set(asset);
    
    if (asset.type === 'document' && !asset.textContent) {
      try {
        const { data: urlData } = await this.supabase.storage.from('assets').createSignedUrl(asset.storage_path, 60);
        if (urlData?.signedUrl) {
          const res = await fetch(urlData.signedUrl);
          const text = await res.text();
          this.previewAsset.set({ ...asset, textContent: text });
        } else {
          this.previewAsset.set({ ...asset, textContent: 'No se pudo generar la URL de texto' });
        }
      } catch (e) {
        this.previewAsset.set({ ...asset, textContent: 'Error al cargar el contenido de texto' });
      }
    }
  }

  closePreview() {
    this.previewAsset.set(null);
    this.isEditing.set(false);
    this.editFilename = '';
    this.editTextContent = '';
    if (this.imageEditorInstance) {
      this.imageEditorInstance.terminate();
      this.imageEditorInstance = null;
    }
  }
  
  startEditing() {
    const asset = this.previewAsset();
    if (!asset) return;
    
    this.isEditing.set(true);
    this.editFilename = asset.filename;
    this.editTextContent = asset.textContent || '';
    
    if (asset.type === 'image') {
      setTimeout(() => this.initImageEditor(), 100);
    }
  }
  
  cancelEditing() {
    this.isEditing.set(false);
    if (this.imageEditorInstance) {
      this.imageEditorInstance.terminate();
      this.imageEditorInstance = null;
    }
  }

  async saveTextEdit(asNew: boolean) {
    const asset = this.previewAsset();
    if (!asset) return;
    
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) return;
    
    try {
      const file = new Blob([this.editTextContent], { type: 'text/plain' });
      let path = asset.storage_path;
      let newFilename = this.editFilename;
      
      let uploadPromise;
      if (asNew) {
        const timestamp = Date.now();
        path = `${session.user.id}/generated-${timestamp}.txt`;
        uploadPromise = this.supabase.storage.from('assets').upload(path, file);
      } else {
        uploadPromise = this.supabase.storage.from('assets').update(path, file, { upsert: true });
      }
      
      const { data: uploadData, error: uploadErr } = await uploadPromise;
        
      if (uploadErr) throw uploadErr;
      
      if (asNew) {
        await this.supabase.from('assets').insert({
          user_id: session.user.id,
          filename: newFilename,
          mime_type: 'text/plain',
          size_bytes: file.size,
          storage_path: uploadData.path,
          folder: '/',
          tags: asset.tags || ['edited'],
          source: asset.source
        });
      } else {
        await this.supabase.from('assets').update({
          filename: newFilename,
          size_bytes: file.size,
          storage_path: uploadData.path
        }).eq('id', asset.id);
      }
      
      this.notificationService.notify('asset_updated', 'success', 'Recurso guardado', `El recurso de texto se ha guardado correctamente.`);
      this.closePreview();
      this.loadAssets();
    } catch (e: any) {
      this.notificationService.notify('asset_error', 'error', 'Error al guardar', e.message);
    }
  }
  
  private initImageEditor() {
    const asset = this.previewAsset();
    const container = document.getElementById('filerobot-editor');
    if (!container || !asset) return;
    
    const config: any = {
      source: asset.preview,
      onSave: async (editedImageObject: any, designState: any) => {
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session) return;
        
        try {
          const res = await fetch(editedImageObject.imageBase64);
          const blob = await res.blob();
          
          const asNew = confirm('¿Guardar como nueva imagen? (Cancelar para sobrescribir)');
          const newName = prompt('Nombre de archivo:', this.editFilename) || this.editFilename;
          
          let path = asset.storage_path;
          let uploadPromise;
          if (asNew) {
            path = `${session.user.id}/edited-${Date.now()}.jpg`;
            uploadPromise = this.supabase.storage.from('assets').upload(path, blob);
          } else {
            uploadPromise = this.supabase.storage.from('assets').update(path, blob, { upsert: true });
          }
          
          const { data: uploadData, error: uploadErr } = await uploadPromise;
            
          if (uploadErr) throw uploadErr;
          
          if (asNew) {
            await this.supabase.from('assets').insert({
              user_id: session.user.id,
              filename: newName,
              mime_type: editedImageObject.mimeType || 'image/jpeg',
              size_bytes: blob.size,
              storage_path: uploadData.path,
              folder: '/',
              tags: asset.tags || ['edited'],
              source: asset.source
            });
          } else {
            await this.supabase.from('assets').update({
              filename: newName,
              size_bytes: blob.size,
              storage_path: uploadData.path
            }).eq('id', asset.id);
          }
          
          this.notificationService.notify('asset_updated', 'success', 'Imagen guardada', `Imagen guardada con éxito.`);
          this.closePreview();
          this.loadAssets();
        } catch (e: any) {
          this.notificationService.notify('asset_error', 'error', 'Error al guardar', e.message);
        }
      },
      annotationsCommon: {
        fill: '#ff0000'
      },
      Text: { text: 'Tu texto aquí' }
    };
    
    this.imageEditorInstance = new FilerobotImageEditor(container, config);
    this.imageEditorInstance.render({
      onClose: (closingReason: any) => {
        this.cancelEditing();
      }
    });
  }

  async renameAsset(asset: any) {
    const newName = prompt('Nuevo nombre de archivo:', asset.filename);
    if (!newName || newName === asset.filename) return;

    const { error } = await this.supabase.from('assets').update({ filename: newName }).eq('id', asset.id);
    if (error) {
      this.notificationService.notify('asset_error', 'error', 'Error al renombrar', error.message);
    } else {
      this.notificationService.notify('asset_updated', 'success', 'Recurso renombrado', `El recurso ahora se llama ${newName}.`);
      this.previewAsset.update(a => a ? { ...a, filename: newName } : null);
      this.loadAssets();
    }
  }

  async deleteAsset(asset: any) {
    if (!confirm(`¿Estás seguro de que quieres eliminar ${asset.filename}?`)) return;
    
    // Optimistic UI update: remove from local signal first
    this.mockAssets.update(assets => assets.filter(a => a.id !== asset.id));

    const { error: dbError } = await this.supabase.from('assets').delete().eq('id', asset.id);
    if (!dbError) {
      await this.supabase.storage.from('assets').remove([asset.storage_path]);
      this.notificationService.notify('asset_deleted', 'success', 'Recurso eliminado', `Se ha eliminado correctamente ${asset.filename}`);
      this.closePreview();
      this.loadAssets();
    } else {
      this.notificationService.notify('asset_error', 'error', 'Error al eliminar', dbError.message);
      // Rollback on error by reloading
      this.loadAssets();
    }
  }

  openScheduleForm() {
    const asset = this.previewAsset();
    if (!asset) return;

    const uploadedAsset: UploadedAsset = {
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mime_type || 'application/octet-stream',
      sizeBytes: asset.size_bytes || 0,
      storagePath: asset.storage_path,
      previewUrl: asset.preview || ''
    };

    this.initialTextForForm = '';
    this.initialAssetsForForm = [uploadedAsset];
    this.scheduleFormOpen.set(true);
  }

  async onScheduleSaved(formData: PostFormData) {
    try {
      this.isScheduling.set(true);
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session) {
        this.isScheduling.set(false);
        return;
      }

      let recurrenceRuleId: string | undefined = undefined;
      if (formData.recurrenceRule) {
        const { data: rule, error: rErr } = await this.supabase.from('recurrence_rules').insert({
          user_id: session.user.id,
          frequency: formData.recurrenceRule.frequency,
          interval: formData.recurrenceRule.interval,
          end_date: formData.recurrenceRule.endDate ? formData.recurrenceRule.endDate.toISOString() : null
        }).select().single();
        if (rErr) throw rErr;
        recurrenceRuleId = rule.id;
      }

      const scheduledAt = formData.publishImmediately ? new Date().toISOString() : formData.scheduledAt.toISOString();
      const { error } = await this.supabase.from('scheduled_posts').insert({
        user_id: session.user.id,
        channel_id: formData.channelId,
        text_content: formData.text,
        media_asset_ids: formData.mediaAssetIds,
        scheduled_at: scheduledAt,
        status: 'scheduled',
        recurrence_rule_id: recurrenceRuleId
      });

      if (error) throw error;

      this.scheduleFormOpen.set(false);
      this.isScheduling.set(false);
      const msg = formData.publishImmediately
        ? 'Tu publicación se ha encolado para publicarse ahora.'
        : 'Tu publicación se ha programado correctamente.';
      this.notificationService.notify(
        'post_scheduled',
        'success',
        formData.publishImmediately ? 'Publicando...' : 'Publicación programada',
        msg
      );
      this.closePreview();
    } catch (err: any) {
      console.error(err);
      this.isScheduling.set(false);
      alert('Error al programar la publicación: ' + err.message);
    }
  }

  async loadAssets() {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await this.supabase
      .from('assets')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error loading assets', error);
      return;
    }
    
    if (data) {
      const mapped = await Promise.all(data.map(async (a: any) => {
        let preview = null;
        if (a.mime_type?.startsWith('image/')) {
          const { data: urlData } = await this.supabase.storage.from('assets').createSignedUrl(a.storage_path, 3600);
          preview = urlData?.signedUrl;
        }
        return {
          id: a.id,
          filename: a.filename,
          type: a.mime_type?.startsWith('image/') ? 'image' : a.mime_type?.startsWith('video/') ? 'video' : 'document',
          source: a.source,
          size: (a.size_bytes / 1024).toFixed(1) + ' KB',
          date: new Date(a.created_at),
          storage_path: a.storage_path,
          preview,
          mime_type: a.mime_type,
          size_bytes: a.size_bytes
        };
      }));
      this.mockAssets.set(mapped);
    }
  }

  onFileDropped(event: CdkDragDrop<any>) {}

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingOver.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingOver.set(false);
  }

  onNativeDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingOver.set(false);
    
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFiles(Array.from(files));
    }
  }

  onFileSelected(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.handleFiles(Array.from(files));
    }
  }

  private async handleFiles(files: File[]) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) return;

    this.notificationService.notify('upload_start', 'info', 'Subiendo', `Subiendo ${files.length} archivo(s)...`);
    try {
      for (const file of files) {
        const path = `${session.user.id}/${Date.now()}-${file.name}`;
        const { data: uploadData, error: uploadErr } = await this.supabase.storage
          .from('assets')
          .upload(path, file);
          
        if (uploadErr) throw uploadErr;
        
        const { data: assetData, error: insertErr } = await this.supabase
          .from('assets')
          .insert({
            user_id: session.user.id,
            filename: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            storage_path: path,
            folder: '/',
            tags: [],
            source: 'user_upload'
          })
          .select()
          .single();
          
        if (insertErr) throw insertErr;
        
        let preview = null;
        if (file.type.startsWith('image/')) {
          const { data: urlData } = await this.supabase.storage.from('assets').createSignedUrl(path, 3600);
          preview = urlData?.signedUrl;
        }

        const newAsset = {
          id: assetData.id,
          filename: assetData.filename,
          type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document',
          source: 'user_upload',
          size: (file.size / 1024).toFixed(1) + ' KB',
          date: new Date(),
          preview,
          storage_path: path,
          mime_type: file.type,
          size_bytes: file.size
        };
        this.mockAssets.update(assets => [newAsset, ...assets]);
      }
      this.notificationService.notify('upload_success', 'success', 'Subida completada', 'Archivos subidos correctamente.');
      this.loadAssets();
    } catch (e: any) {
      console.error(e);
      this.notificationService.notify('upload_error', 'error', 'Error de subida', e.message);
    }
  }

  translateType(type: string): string {
    const map: Record<string, string> = {
      image: 'Imagen',
      video: 'Vídeo',
      document: 'Documento'
    };
    return map[type.toLowerCase()] || type;
  }

  translateSource(source: string): string {
    const map: Record<string, string> = {
      user_upload: 'Subido',
      ai_generated: 'Generado por IA',
      edited: 'Editado'
    };
    return map[source.toLowerCase()] || source;
  }
}
