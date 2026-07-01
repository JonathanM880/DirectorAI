import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { SupabaseClient } from '@supabase/supabase-js';
import FilerobotImageEditor from 'filerobot-image-editor';
import { NotificationService } from '../../core/services/notification.service';
import { AssetUploadService } from '../../core/services/asset-upload.service';

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  template: `
    <div class="grid grid-cols-[280px_1fr] h-full bg-background text-foreground">
      <div class="p-4 border-r border-border bg-muted/30">
        <h2 class="text-xl font-bold mb-4 font-display">Assets</h2>
        <div>
          <div class="px-3 py-2.5 rounded-md cursor-pointer flex items-center gap-3 mb-1 text-muted-foreground transition-colors hover:bg-white/5" [class.bg-secondary]="activeFilter() === 'All Files'" [class.text-foreground]="activeFilter() === 'All Files'" [class.font-medium]="activeFilter() === 'All Files'" (click)="setFilter('All Files')">
            <span>📁</span> All Files
          </div>
          <div class="px-3 py-2.5 rounded-md cursor-pointer flex items-center gap-3 mb-1 text-muted-foreground transition-colors hover:bg-white/5" [class.bg-secondary]="activeFilter() === 'Images'" [class.text-foreground]="activeFilter() === 'Images'" [class.font-medium]="activeFilter() === 'Images'" (click)="setFilter('Images')">
            <span>📁</span> Images
          </div>
          <div class="px-3 py-2.5 rounded-md cursor-pointer flex items-center gap-3 mb-1 text-muted-foreground transition-colors hover:bg-white/5" [class.bg-secondary]="activeFilter() === 'Videos'" [class.text-foreground]="activeFilter() === 'Videos'" [class.font-medium]="activeFilter() === 'Videos'" (click)="setFilter('Videos')">
            <span>📁</span> Videos
          </div>
          <div class="px-3 py-2.5 rounded-md cursor-pointer flex items-center gap-3 mb-1 text-muted-foreground transition-colors hover:bg-white/5" [class.bg-secondary]="activeFilter() === 'Documents'" [class.text-foreground]="activeFilter() === 'Documents'" [class.font-medium]="activeFilter() === 'Documents'" (click)="setFilter('Documents')">
            <span>📁</span> Documents
          </div>
        </div>

        <h3 class="mt-6 mb-3 text-sm uppercase tracking-wider text-muted-foreground">Tags</h3>
        <div class="flex flex-wrap gap-2">
          <span class="bg-white/10 px-2.5 py-1 rounded-full text-xs cursor-pointer">#campaign2026</span>
          <span class="bg-white/10 px-2.5 py-1 rounded-full text-xs cursor-pointer">#summer</span>
          <span class="bg-white/10 px-2.5 py-1 rounded-full text-xs cursor-pointer">#ai_generated</span>
        </div>
      </div>

      <div class="p-4 flex flex-col relative transition-colors"
           [class.bg-primary]="isDraggingOver()"
           [style.background-opacity]="isDraggingOver() ? '0.05' : '1'"
           cdkDropList
           (cdkDropListDropped)="onFileDropped($event)"
           (dragover)="onDragOver($event)"
           (dragleave)="onDragLeave($event)"
           (drop)="onNativeDrop($event)">
        
        <div class="flex justify-between items-center mb-4">
          <div class="flex gap-1 bg-secondary p-1 rounded-lg">
            <button class="bg-transparent border-none text-muted-foreground px-3 py-1.5 rounded cursor-pointer" [class.bg-white]="viewMode() === 'grid'" [style.background-opacity]="viewMode() === 'grid' ? '0.1' : '0'" [class.text-foreground]="viewMode() === 'grid'" (click)="viewMode.set('grid')">▦</button>
            <button class="bg-transparent border-none text-muted-foreground px-3 py-1.5 rounded cursor-pointer" [class.bg-white]="viewMode() === 'list'" [style.background-opacity]="viewMode() === 'list' ? '0.1' : '0'" [class.text-foreground]="viewMode() === 'list'" (click)="viewMode.set('list')">☰</button>
          </div>
          
          <div class="flex items-center gap-3 bg-white/5 px-4 py-1.5 rounded-full text-sm" *ngIf="selectedCount() > 0">
            <span>{{ selectedCount() }} selected</span>
            <button class="px-3 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-secondary text-secondary-foreground text-sm">Move</button>
            <button class="px-3 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-destructive text-destructive-foreground text-sm">Delete</button>
          </div>
          
          <button class="px-4 py-2.5 rounded-md border-none cursor-pointer font-semibold bg-primary text-primary-foreground" (click)="fileInput.click()">Upload Files</button>
          <input type="file" #fileInput multiple hidden (change)="onFileSelected($event)">
        </div>

        <div class="absolute inset-0 bg-black/90 backdrop-blur-sm z-10 flex items-center justify-center border-2 border-dashed border-primary rounded-xl pointer-events-none" *ngIf="isDraggingOver()">
          <div class="text-center">
            <h3 class="text-primary mb-2 text-xl font-bold">Drop files here to upload</h3>
            <p class="text-muted-foreground">Images, videos, and documents up to 50MB</p>
          </div>
        </div>

        <div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4" *ngIf="viewMode() === 'grid'">
          <div class="bg-white/5 border border-border rounded-lg overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5 hover:border-white/20" *ngFor="let asset of filteredAssets" (click)="openPreview(asset)">
            <div class="h-[140px] bg-black/20 relative flex items-center justify-center">
              <span class="absolute top-2 right-2 bg-black/60 px-2 py-0.5 rounded text-xs font-semibold" [class.bg-primary]="asset.source === 'ai_generated'" [class.text-primary-foreground]="asset.source === 'ai_generated'">
                {{ asset.source === 'ai_generated' ? 'AI' : 'Upload' }}
              </span>
              <img *ngIf="asset.type === 'image'" [src]="asset.preview" alt="Preview" class="w-full h-full object-cover">
              <div *ngIf="asset.type !== 'image'" class="text-5xl">📄</div>
            </div>
            <div class="p-3">
              <div class="font-medium whitespace-nowrap overflow-hidden text-ellipsis mb-1">{{ asset.filename }}</div>
              <div class="text-xs text-muted-foreground">{{ asset.date | date:'shortDate' }} • {{ asset.size }}</div>
            </div>
          </div>
        </div>

        <div *ngIf="viewMode() === 'list'">
          <table class="w-full border-collapse">
            <thead>
              <tr>
                <th class="px-4 py-3 text-left border-b border-border text-muted-foreground font-medium text-sm"><input type="checkbox"></th>
                <th class="px-4 py-3 text-left border-b border-border text-muted-foreground font-medium text-sm">Name</th>
                <th class="px-4 py-3 text-left border-b border-border text-muted-foreground font-medium text-sm">Type</th>
                <th class="px-4 py-3 text-left border-b border-border text-muted-foreground font-medium text-sm">Source</th>
                <th class="px-4 py-3 text-left border-b border-border text-muted-foreground font-medium text-sm">Size</th>
                <th class="px-4 py-3 text-left border-b border-border text-muted-foreground font-medium text-sm">Date Added</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let asset of filteredAssets" (click)="openPreview(asset)" class="cursor-pointer hover:bg-white/5">
                <td class="px-4 py-3 text-left border-b border-border"><input type="checkbox" (click)="$event.stopPropagation()"></td>
                <td class="px-4 py-3 text-left border-b border-border">{{ asset.filename }}</td>
                <td class="px-4 py-3 text-left border-b border-border">{{ asset.type }}</td>
                <td class="px-4 py-3 text-left border-b border-border">{{ asset.source }}</td>
                <td class="px-4 py-3 text-left border-b border-border">{{ asset.size }}</td>
                <td class="px-4 py-3 text-left border-b border-border">{{ asset.date | date:'short' }}</td>
              </tr>
            </tbody>
          </table>
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
                <p *ngIf="!previewAsset().textContent">Loading text content...</p>
                <pre *ngIf="previewAsset().textContent" class="whitespace-pre-wrap font-inherit m-0 leading-relaxed">{{ previewAsset().textContent }}</pre>
              </div>
              
              <div class="p-5 bg-background border-t border-border">
                <div class="flex justify-between items-center">
                  <div>
                    <h3 class="m-0 mb-2 font-display font-bold text-xl">{{ previewAsset().filename }}</h3>
                    <p class="m-0 text-muted-foreground text-sm">{{ previewAsset().size }} • {{ previewAsset().source }}</p>
                  </div>
                  <div class="flex gap-2" *ngIf="previewAsset()?.type !== 'video'">
                    <button class="px-3 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-secondary text-secondary-foreground text-sm" (click)="startEditing()">Edit</button>
                    <button class="px-3 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-destructive text-destructive-foreground text-sm" (click)="deleteAsset(previewAsset())">Delete</button>
                  </div>
                  <div class="flex gap-2" *ngIf="previewAsset()?.type === 'video'">
                    <button class="px-3 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-destructive text-destructive-foreground text-sm" (click)="deleteAsset(previewAsset())">Delete</button>
                  </div>
                </div>
              </div>
            </ng-container>

            <!-- Text Editor -->
            <div class="flex flex-col w-full h-[70vh] bg-background" *ngIf="isEditing() && previewAsset()?.type === 'document'">
              <div class="p-4 border-b border-border">
                <input class="w-full px-3 py-2 bg-black/20 border border-border rounded-md text-foreground font-inherit outline-none focus:border-primary" [(ngModel)]="editFilename" placeholder="Filename">
              </div>
              <textarea class="flex-1 p-5 bg-transparent border-none text-foreground font-mono resize-none leading-relaxed outline-none" [(ngModel)]="editTextContent"></textarea>
              <div class="p-4 border-t border-border flex justify-end gap-3">
                <button class="px-4 py-2.5 rounded-md border-none cursor-pointer font-semibold bg-secondary text-secondary-foreground" (click)="cancelEditing()">Cancel</button>
                <button class="px-4 py-2.5 rounded-md border-none cursor-pointer font-semibold bg-primary text-primary-foreground" (click)="saveTextEdit(false)">Overwrite Original</button>
                <button class="px-4 py-2.5 rounded-md border-none cursor-pointer font-semibold bg-primary text-primary-foreground" (click)="saveTextEdit(true)">Save as New</button>
              </div>
            </div>

            <!-- Image Editor Container -->
            <div class="flex flex-col w-full h-[70vh] bg-background" *ngIf="isEditing() && previewAsset()?.type === 'image'">
              <div id="filerobot-editor" style="width: 100%; height: 100%;"></div>
            </div>
          </div>
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

  // Mock data for UI layout
  mockAssets = signal<any[]>([
    { id: '1', filename: 'summer_promo.jpg', type: 'image', source: 'user_upload', size: '2.4 MB', date: new Date(), preview: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400' },
    { id: '2', filename: 'ai_generated_copy_1.txt', type: 'document', source: 'ai_generated', size: '1.2 KB', date: new Date() },
    { id: '3', filename: 'product_video_raw.mp4', type: 'video', source: 'user_upload', size: '45.1 MB', date: new Date() }
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
          this.previewAsset.set({ ...asset, textContent: 'Could not generate text URL' });
        }
      } catch (e) {
        this.previewAsset.set({ ...asset, textContent: 'Failed to load text content' });
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
      
      if (asNew || newFilename !== asset.filename) {
        const timestamp = Date.now();
        path = `${session.user.id}/generated-${timestamp}.txt`;
      }
      
      const { data: uploadData, error: uploadErr } = await this.supabase.storage
        .from('assets')
        .upload(path, file, { upsert: !asNew && newFilename === asset.filename });
        
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
      
      this.notificationService.notify('asset_updated', 'success', 'Asset Saved', `Successfully saved text asset.`);
      this.closePreview();
      this.loadAssets();
    } catch (e: any) {
      this.notificationService.notify('asset_error', 'error', 'Error Saving', e.message);
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
          
          const asNew = confirm('Save as new image? (Cancel to overwrite)');
          const newName = prompt('Filename:', this.editFilename) || this.editFilename;
          
          let path = asset.storage_path;
          if (asNew || newName !== asset.filename) {
            path = `${session.user.id}/edited-${Date.now()}.jpg`;
          }
          
          const { data: uploadData, error: uploadErr } = await this.supabase.storage
            .from('assets')
            .upload(path, blob, { upsert: !asNew && newName === asset.filename });
            
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
          
          this.notificationService.notify('asset_updated', 'success', 'Image Saved', `Successfully saved image.`);
          this.closePreview();
          this.loadAssets();
        } catch (e: any) {
          this.notificationService.notify('asset_error', 'error', 'Error Saving', e.message);
        }
      },
      annotationsCommon: {
        fill: '#ff0000'
      },
      Text: { text: 'Your Text Here' }
    };
    
    this.imageEditorInstance = new FilerobotImageEditor(container, config);
    this.imageEditorInstance.render({
      onClose: (closingReason: any) => {
        this.cancelEditing();
      }
    });
  }

  async deleteAsset(asset: any) {
    if (!confirm(`Are you sure you want to delete ${asset.filename}?`)) return;
    
    // Optimistic UI update: remove from local signal first
    this.mockAssets.update(assets => assets.filter(a => a.id !== asset.id));

    const { error: dbError } = await this.supabase.from('assets').delete().eq('id', asset.id);
    if (!dbError) {
      await this.supabase.storage.from('assets').remove([asset.storage_path]);
      this.notificationService.notify('asset_deleted', 'success', 'Asset Deleted', `Successfully deleted ${asset.filename}`);
      this.closePreview();
      this.loadAssets();
    } else {
      this.notificationService.notify('asset_error', 'error', 'Delete Failed', dbError.message);
      // Rollback on error by reloading
      this.loadAssets();
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
          preview
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

    this.notificationService.notify('upload_start', 'info', 'Uploading', `Uploading ${files.length} file(s)...`);
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
          storage_path: path
        };
        this.mockAssets.update(assets => [newAsset, ...assets]);
      }
      this.notificationService.notify('upload_success', 'success', 'Upload Complete', 'Successfully uploaded files.');
      this.loadAssets();
    } catch (e: any) {
      console.error(e);
      this.notificationService.notify('upload_error', 'error', 'Upload Failed', e.message);
    }
  }
}
