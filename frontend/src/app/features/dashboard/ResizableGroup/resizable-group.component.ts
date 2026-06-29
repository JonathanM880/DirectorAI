import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HlmResizableImports } from '@spartan-ng/helm/resizable';

@Component({
  selector: 'app-resizable-group',
  standalone: true,
  imports: [CommonModule, HlmResizableImports],
  host: {
    class: 'block w-full h-full'
  },
  template: `
    <hlm-resizable-group direction="horizontal" class="h-full w-full max-w-4xl rounded-lg border">
      
      <hlm-resizable-panel>
        <div class="flex h-full items-center justify-center p-6">
          <span class="font-semibold">One</span>
        </div>
      </hlm-resizable-panel>
      
      <hlm-resizable-handle />
      
      <hlm-resizable-panel>
        <div class="flex h-full items-center justify-center p-6">
          <span class="font-semibold">Two</span>
        </div>
      </hlm-resizable-panel>
      
      <hlm-resizable-handle />
      
      <hlm-resizable-panel>
        <div class="flex h-full items-center justify-center p-6">
          <span class="font-semibold">Three</span>
        </div>
      </hlm-resizable-panel>

    </hlm-resizable-group>
  `
})
export class ResizableGroupComponent {}