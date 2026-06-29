import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HlmResizableImports } from '@spartan-ng/helm/resizable';

@Component({
  selector: 'app-resizable-group',
  standalone: true,
  imports: [CommonModule, HlmResizableImports],
  template: `
    <hlm-resizable-group class="h-[200px] w-[500px] max-w-md rounded-lg border">
      <hlm-resizable-panel>
        <div class="flex h-full items-center justify-center p-6">One</div>
      </hlm-resizable-panel>
      <hlm-resizable-handle />
      <hlm-resizable-panel>
        <hlm-resizable-group direction="vertical">
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
      </hlm-resizable-panel>
    </hlm-resizable-group>
  `
})
export class ResizableGroupComponent {}
