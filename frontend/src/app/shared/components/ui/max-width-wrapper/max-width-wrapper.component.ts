import { Component, Input } from '@angular/core';
import { cn } from '../../../utils/cn';

@Component({
  selector: 'app-max-width-wrapper, [appMaxWidthWrapper]',
  standalone: true,
  template: `<ng-content />`,
  host: {
    '[class]': 'classes',
  },
})
export class MaxWidthWrapperComponent {
  @Input() className: string = '';

  get classes(): string {
    return cn(
      'mx-auto w-full max-w-screen-xl px-2.5 md:px-20',
      this.className
    );
  }
}
