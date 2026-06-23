import {
  Component,
  Input,
  ContentChildren,
  AfterContentInit,
  ElementRef,
  Renderer2,
  QueryList,
} from '@angular/core';

@Component({
  selector: '[appAnimatedGroup]',
  standalone: true,
  template: `<ng-content />`
})
export class AnimatedGroupDirective implements AfterContentInit {
  @Input() staggerDelay = 0.05;
  @Input() delay = 0;

  @ContentChildren('animatedItem', { descendants: true }) items!: QueryList<ElementRef>;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngAfterContentInit() {
    const children = this.el.nativeElement.children as unknown as HTMLElement[];
    Array.from(children).forEach((child: HTMLElement, index) => {
      this.renderer.setStyle(child, 'opacity', '0');
      this.renderer.setStyle(child, 'filter', 'blur(12px)');
      this.renderer.setStyle(child, 'transform', 'translateY(12px)');
      this.renderer.setStyle(child, 'transition', `opacity 1.5s cubic-bezier(0.5, 0, 0.2, 1), filter 1.5s cubic-bezier(0.5, 0, 0.2, 1), transform 1.5s cubic-bezier(0.5, 0, 0.2, 1)`);
      this.renderer.setStyle(child, 'transition-delay', `${this.delay + index * this.staggerDelay}s`);

      requestAnimationFrame(() => {
        this.renderer.setStyle(child, 'opacity', '1');
        this.renderer.setStyle(child, 'filter', 'blur(0px)');
        this.renderer.setStyle(child, 'transform', 'translateY(0)');
      });
    });
  }
}
