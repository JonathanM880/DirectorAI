import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AngularAuthService } from '../../../core/services/auth.service';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmButtonImports,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-background">
      <div class="w-full max-w-sm">
        <hlm-card class="border-border bg-card">
          <hlm-card-header class="space-y-1">
            <h3 hlmCardTitle class="text-2xl font-bold tracking-tight text-center text-primary">DirectorAI</h3>
            <p hlmCardDescription class="text-center text-muted-foreground">
              Sign in to your account
            </p>
          </hlm-card-header>
          <div hlmCardContent>
            <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="space-y-4">
              <hlm-field-group class="space-y-4">
                <hlm-field>
                  <label hlmFieldLabel for="email">Email</label>
                  <input
                    hlmInput
                    type="email"
                    id="email"
                    placeholder="you@example.com"
                    formControlName="email"
                    class="w-full"
                  />
                  <hlm-field-error validator="required">Email is required.</hlm-field-error>
                  <hlm-field-error validator="email">Enter a valid email address.</hlm-field-error>
                </hlm-field>

                <hlm-field>
                  <label hlmFieldLabel for="password">Password</label>
                  <input
                    hlmInput
                    type="password"
                    id="password"
                    placeholder="••••••••"
                    formControlName="password"
                    class="w-full"
                  />
                  <hlm-field-error validator="required">Password is required.</hlm-field-error>
                </hlm-field>

                @if (errorMessage()) {
                  <div class="p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20 text-center font-medium">
                    {{ errorMessage() }}
                  </div>
                }

                <div class="flex flex-col gap-2 pt-2">
                  <button
                    hlmBtn
                    type="submit"
                    [disabled]="loginForm.invalid || isLoading()"
                    class="w-full"
                  >
                    {{ isLoading() ? 'Signing in...' : 'Sign in' }}
                  </button>
                  <!-- <button
                    hlmBtn
                    variant="outline"
                    type="button"
                    (click)="onSignInWithGoogle()"
                    [disabled]="isLoading()"
                    class="w-full"
                  >
                    Sign in with Google
                  </button> -->
                </div>

                <div class="text-center text-sm mt-4 flex flex-col gap-2 pt-2">
                  <a routerLink="/auth/recover" class="text-primary hover:underline font-medium">
                    Forgot password?
                  </a>
                  <p class="text-muted-foreground text-xs mt-1">
                    Don't have an account?
                    <a routerLink="/auth/register" class="text-primary hover:underline font-semibold">
                      Sign up
                    </a>
                  </p>
                </div>
              </hlm-field-group>
            </form>
          </div>
        </hlm-card>
      </div>
    </div>
  `
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AngularAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  public readonly loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  public readonly isLoading = signal(false);
  public readonly errorMessage = signal<string | null>(null);

  async onSubmit() {
    if (this.loginForm.invalid) {
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const { email, password } = this.loginForm.value;
      const result = await this.authService.signIn(email!, password!);

      if (result.error) {
        this.errorMessage.set(result.error.message);
        return;
      }

      const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/app';
      this.router.navigateByUrl(returnUrl);
    } catch (err) {
      this.errorMessage.set('An unexpected error occurred. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async onSignInWithGoogle() {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      await this.authService.signInWithOAuth('google');
    } catch (err) {
      this.errorMessage.set('Google sign-in failed. Please try again.');
      this.isLoading.set(false);
    }
  }
}

