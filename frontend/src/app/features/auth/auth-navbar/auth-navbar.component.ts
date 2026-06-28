import { Component, HostListener, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '../../../shared/components/ui/button/button.component';
import { LogoComponent } from '../../../shared/components/ui/logo/logo.component';

@Component({
  selector: 'app-auth-navbar',
  standalone: true,
  imports: [RouterLink, ButtonDirective, LogoComponent],
  template: `
    <nav [attr.data-state]="menuState() && 'active'" class="fixed z-20 w-full px-2 group">
      <div
        [class]="
          isScrolled()
            ? 'mx-auto mt-2 max-w-6xl px-6 transition-all duration-300 lg:px-12 bg-background/50 max-w-4xl rounded-2xl backdrop-blur-lg lg:px-5'
            : 'mx-auto mt-2 max-w-6xl px-6 transition-all duration-300 lg:px-12'
        "
      >
        <div class="relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
          <div class="flex w-full justify-between lg:w-auto">
            <a routerLink="/" aria-label="home" class="flex items-center space-x-2">
              <app-logo />
            </a>
            <button
              (click)="toggleMenu()"
              [attr.aria-label]="menuState() ? 'Close Menu' : 'Open Menu'"
              class="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="m-auto size-6 duration-200 group-data-[state=active]:rotate-180 group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0"
              >
                <line x1="4" x2="20" y1="12" y2="12" />
                <line x1="4" x2="20" y1="6" y2="6" />
                <line x1="4" x2="20" y1="18" y2="18" />
              </svg>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200 group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          <div class="absolute inset-0 m-auto hidden size-fit lg:block">
            <ul class="flex gap-8 text-sm">
              @for (item of menuItems; track item.name) {
                <li>
                  <a
                    [href]="item.href"
                    class="text-muted-foreground hover:text-accent-foreground block duration-150"
                  >
                    <span>{{ item.name }}</span>
                  </a>
                </li>
              }
            </ul>
          </div>

          <div
            [class]="
              menuState()
                ? 'bg-background lg:group-data-[state=active]:flex mb-6 block w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent'
                : 'bg-background lg:group-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent'
            "
          >
            <div class="lg:hidden">
              <ul class="space-y-6 text-base">
                @for (item of menuItems; track item.name) {
                  <li>
                    <a
                      [href]="item.href"
                      class="text-muted-foreground hover:text-accent-foreground block duration-150"
                    >
                      <span>{{ item.name }}</span>
                    </a>
                  </li>
                }
              </ul>
            </div>
            <div class="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
              <a
                routerLink="/auth/login"
                appButton
                variant="outline"
                size="sm"
                class="font-bold"
                [class.lg-hidden]="isScrolled()"
              >
                Iniciar sesión
              </a>
              <a routerLink="/auth/register" appButton size="sm" [class.lg-hidden]="isScrolled()">
                Registrarse
              </a>
              <!-- <a
                routerLink="/auth/login"
                appButton
                size="sm"
                [class.lg-inline-flex]="isScrolled()"
                [class.hidden]="!isScrolled()"
              >
                Comenzar
              </a> -->
            </div>
          </div>
        </div>
      </div>
    </nav>
  `
})
export class AuthNavbarComponent {
  protected menuState = signal(false);
  protected isScrolled = signal(false);

  readonly menuItems: { name: string; href: string }[] = [];

  @HostListener('window:scroll')
  onScroll() {
    this.isScrolled.set(window.scrollY > 50);
  }

  toggleMenu() {
    this.menuState.update(v => !v);
  }
}
