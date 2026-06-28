import { Component } from '@angular/core';

@Component({
  selector: 'app-logo',
  standalone: true,
  imports: [],
  template: `
    <img src="/images/logo.png" alt="DirectorAI" class="h-6 w-auto" />
  `
})
export class LogoComponent {}
