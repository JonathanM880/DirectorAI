import { Component, HostListener, signal } from '@angular/core';

import { RouterLink } from '@angular/router';
import { ButtonDirective } from '../../shared/components/ui/button/button.component';
import { AnimatedGroupDirective } from '../../shared/components/ui/animated-group/animated-group.component';
import { LogoComponent } from './logo.component';
import { ArrowRightIconComponent } from './icons.component';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [RouterLink, ButtonDirective, AnimatedGroupDirective, LogoComponent],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.scss',
})
export class LandingPageComponent {
  protected menuState = signal(false);
  protected isScrolled = signal(false);

  readonly menuItems: { name: string; href: string }[] = [
    // { name: 'Features', href: '#features' },
    // { name: 'Solution', href: '#solution' },
    // { name: 'Pricing', href: '#pricing' },
    // { name: 'About', href: '#about' },
  ];

  readonly customers = [
    { name: 'Pepe' },
    { name: 'Juan' },
    { name: 'Maria' },
    { name: 'Tomas' },
    { name: 'Pewdiepie' },
    { name: 'Gargamel' },
    { name: 'Edgar' },
    { name: 'Pablo' },
  ];

  @HostListener('window:scroll')
  onScroll() {
    this.isScrolled.set(window.scrollY > 50);
  }

  toggleMenu() {
    this.menuState.update(v => !v);
  }
}
