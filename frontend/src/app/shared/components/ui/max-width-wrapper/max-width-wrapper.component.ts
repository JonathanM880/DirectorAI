import { Component, Input } from '@angular/core';
import { cn } from '../../../utils/cn';

@Component({
  selector: 'app-max-width-height-wrapper, [appMaxWidthHeightWrapper]',
  standalone: true,
  template: `<ng-content />`,
  host: {
    '[class]': 'classes',
  },
})
export class MaxWidthHeightWrapperComponent {
  @Input() className = '';

  get classes(): string {
    return cn(
      "block h-full mx-auto w-full max-w-10xl px-2.5 py-2.5 md:px-10 md:py-10",
      this.className
    );
  }
}
