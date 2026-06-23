import { Component } from '@angular/core';

@Component({
  selector: 'app-icon-arrow-right',
  standalone: true,
  template: `
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="m-auto size-3">
      <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
    </svg>
  `
})
export class ArrowRightIconComponent {}
