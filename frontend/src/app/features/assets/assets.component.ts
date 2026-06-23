import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { SupabaseClient } from '@supabase/supabase-js';

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  template: `
    <div class="assets-container">
      <div class="sidebar">
        <h2>Assets</h2>
        <div class="folder-list">
          <div class="folder-item" [class.active]="activeFilter() === 'All Files'" (click)="setFilter('All Files')">
            <span class="icon">📁</span> All Files
          </div>
          <div class="folder-item" [class.active]="activeFilter() === 'Images'" (click)="setFilter('Images')">
            <span class="icon">📁</span> Images
          </div>
          <div class="folder-item" [class.active]="activeFilter() === 'Videos'" (click)="setFilter('Videos')">
            <span class="icon">📁</span> Videos
          </div>
          <div class="folder-item" [class.active]="activeFilter() === 'Documents'" (click)="setFilter('Documents')">
            <span class="icon">📁</span> Documents
          </div>
        </div>

        <h3 class="tag-title">Tags</h3>
        <div class="tags-list">
          <span class="tag">#campaign2026</span>
          <span class="tag">#summer</span>
          <span class="tag">#ai_generated</span>
        </div>
      </div>

      <div class="main-panel"
           cdkDropList
           (cdkDropListDropped)="onFileDropped($event)"
           (dragover)="onDragOver($event)"
           (dragleave)="onDragLeave($event)"
           (drop)="onNativeDrop($event)"
           [class.drag-over]="isDraggingOver()">
        
        <div class="toolbar">
          <div class="view-toggles">
            <button class="icon-btn" [class.active]="viewMode() === 'grid'" (click)="viewMode.set('grid')">▦</button>
            <button class="icon-btn" [class.active]="viewMode() === 'list'" (click)="viewMode.set('list')">☰</button>
          </div>
          
          <div class="bulk-actions" *ngIf="selectedCount() > 0">
            <span>{{ selectedCount() }} selected</span>
            <button class="btn btn-sm">Move</button>
            <button class="btn btn-sm btn-danger">Delete</button>
          </div>
          
          <button class="btn btn-primary" (click)="fileInput.click()">Upload Files</button>
          <input type="file" #fileInput multiple hidden (change)="onFileSelected($event)">
        </div>

        <div class="upload-overlay" *ngIf="isDraggingOver()">
          <div class="overlay-content">
            <h3>Drop files here to upload</h3>
            <p>Images, videos, and documents up to 50MB</p>
          </div>
        </div>

        <div class="asset-grid" *ngIf="viewMode() === 'grid'">
          <div class="asset-card" *ngFor="let asset of filteredAssets" (click)="openPreview(asset)">
            <div class="thumbnail">
              <span class="badge" [class.ai]="asset.source === 'ai_generated'">
                {{ asset.source === 'ai_generated' ? 'AI' : 'Upload' }}
              </span>
              <img *ngIf="asset.type === 'image'" [src]="asset.preview" alt="Preview">
              <div *ngIf="asset.type !== 'image'" class="file-icon">📄</div>
            </div>
            <div class="asset-info">
              <div class="filename">{{ asset.filename }}</div>
              <div class="meta">{{ asset.date | date:'shortDate' }} • {{ asset.size }}</div>
            </div>
          </div>
        </div>

        <div class="asset-list" *ngIf="viewMode() === 'list'">
          <table class="data-table">
            <thead>
              <tr>
                <th><input type="checkbox"></th>
                <th>Name</th>
                <th>Type</th>
                <th>Source</th>
                <th>Size</th>
                <th>Date Added</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let asset of filteredAssets" (click)="openPreview(asset)" style="cursor: pointer;">
                <td><input type="checkbox" (click)="$event.stopPropagation()"></td>
                <td>{{ asset.filename }}</td>
                <td>{{ asset.type }}</td>
                <td>{{ asset.source }}</td>
                <td>{{ asset.size }}</td>
                <td>{{ asset.date | date:'short' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="preview-modal" *ngIf="previewAsset()" (click)="closePreview()">
          <div class="modal-content" (click)="$event.stopPropagation()">
            <button class="close-btn" (click)="closePreview()">×</button>
            <img *ngIf="previewAsset()?.type === 'image'" [src]="previewAsset().preview" class="preview-media">
            <video *ngIf="previewAsset()?.type === 'video'" controls class="preview-media">
              <source src="https://www.w3schools.com/html/mov_bbb.mp4" type="video/mp4">
            </video>
            <div class="preview-details">
              <h3>{{ previewAsset().filename }}</h3>
              <p>{{ previewAsset().size }} • {{ previewAsset().source }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .assets-container {
      display: grid;
      grid-template-columns: 280px 1fr;
      height: 100%;
      background: var(--color-ink);
      color: var(--color-paper);
    }
    .sidebar {
      padding: var(--space-4);
      border-right: 1px solid var(--color-steel);
      background: rgba(42, 45, 53, 0.3);
    }
    .main-panel {
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      position: relative;
      transition: background 0.2s;
    }
    .main-panel.drag-over {
      background: rgba(62, 200, 138, 0.05);
    }
    .folder-item {
      padding: 10px 12px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 4px;
      color: var(--color-gray-200);
      transition: background 0.2s;
    }
    .folder-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    .folder-item.active {
      background: var(--color-steel);
      color: var(--color-paper);
      font-weight: 500;
    }
    .tag-title {
      margin-top: var(--space-5);
      margin-bottom: var(--space-3);
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-gray-400);
    }
    .tags-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .tag {
      background: rgba(255, 255, 255, 0.08);
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-4);
    }
    .view-toggles {
      display: flex;
      gap: 4px;
      background: var(--color-steel);
      padding: 4px;
      border-radius: 8px;
    }
    .icon-btn {
      background: transparent;
      border: none;
      color: var(--color-gray-300);
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
    }
    .icon-btn.active {
      background: rgba(255, 255, 255, 0.1);
      color: var(--color-paper);
    }
    .bulk-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(255, 255, 255, 0.05);
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 0.9rem;
    }
    .btn {
      padding: 10px 16px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-weight: 600;
      font-family: 'Inter', sans-serif;
    }
    .btn-sm {
      padding: 6px 12px;
      font-size: 0.85rem;
    }
    .btn-primary {
      background: var(--color-signal);
      color: var(--color-ink);
    }
    .btn-danger {
      background: var(--color-fault);
      color: white;
    }
    
    .upload-overlay {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(13, 15, 18, 0.9);
      backdrop-filter: blur(4px);
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px dashed var(--color-live);
      border-radius: 12px;
      pointer-events: none;
    }
    .overlay-content {
      text-align: center;
    }
    .overlay-content h3 {
      color: var(--color-live);
      margin-bottom: 8px;
    }

    .asset-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: var(--space-4);
    }
    .asset-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--color-steel);
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.2s, border-color 0.2s;
    }
    .asset-card:hover {
      transform: translateY(-2px);
      border-color: rgba(255, 255, 255, 0.2);
    }
    .thumbnail {
      height: 140px;
      background: rgba(0, 0, 0, 0.2);
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .thumbnail img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .file-icon {
      font-size: 3rem;
    }
    .badge {
      position: absolute;
      top: 8px; right: 8px;
      background: rgba(0,0,0,0.6);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge.ai {
      background: var(--color-signal);
      color: var(--color-ink);
    }
    .asset-info {
      padding: 12px;
    }
    .filename {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }
    .meta {
      font-size: 0.8rem;
      color: var(--color-gray-400);
    }
    
    .data-table {
      width: 100%;
      border-collapse: collapse;
    }
    .data-table th, .data-table td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid var(--color-steel);
    }
    .data-table th {
      color: var(--color-gray-300);
      font-weight: 500;
      font-size: 0.9rem;
    }
    
    .preview-modal {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(8px);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }
    .modal-content {
      background: var(--color-ink);
      border: 1px solid var(--color-steel);
      border-radius: 12px;
      max-width: 900px;
      width: 100%;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .close-btn {
      position: absolute;
      top: 16px; right: 16px;
      background: rgba(0,0,0,0.5);
      border: none;
      color: white;
      font-size: 1.5rem;
      width: 32px; height: 32px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
    }
    .preview-media {
      width: 100%;
      max-height: 60vh;
      object-fit: contain;
      background: black;
    }
    .preview-details {
      padding: 20px;
      background: var(--color-ink);
      border-top: 1px solid var(--color-steel);
    }
    .preview-details h3 {
      margin: 0 0 8px 0;
    }
    .preview-details p {
      margin: 0;
      color: var(--color-gray-300);
      font-size: 0.9rem;
    }
  `]
})
export class AssetsComponent implements OnInit {
  private supabase = inject(SupabaseClient);

  viewMode = signal<'grid' | 'list'>('grid');
  isDraggingOver = signal(false);
  selectedCount = signal(0);
  activeFilter = signal('All Files');
  previewAsset = signal<any>(null);

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

  openPreview(asset: any) {
    if (asset.type === 'image' || asset.type === 'video') {
      this.previewAsset.set(asset);
    }
  }

  closePreview() {
    this.previewAsset.set(null);
  }

  async loadAssets() {}

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

  private handleFiles(files: File[]) {
    console.log('Uploading files:', files);
    // Mock upload by adding to the signal array
    const newAssets = files.map(f => ({
      id: Math.random().toString(),
      filename: f.name,
      type: f.type.startsWith('image') ? 'image' : f.type.startsWith('video') ? 'video' : 'document',
      source: 'user_upload',
      size: (f.size / 1024 / 1024).toFixed(1) + ' MB',
      date: new Date(),
      preview: f.type.startsWith('image') ? URL.createObjectURL(f) : null
    }));
    this.mockAssets.update(assets => [...newAssets, ...assets]);
  }
}
