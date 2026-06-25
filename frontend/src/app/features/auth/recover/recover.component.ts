import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AngularAuthService } from '../../../core/services/auth.service';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';

@Component({
  selector: 'app-recover',
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
              Reset your password
            </p>
          </hlm-card-header>
          <div hlmCardContent>
            <form [formGroup]="recoverForm" (ngSubmit)="onSubmit()" class="space-y-4">
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

                @if (errorMessage()) {
                  <div class="p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20 text-center font-medium">
                    {{ errorMessage() }}
                  </div>
                }

                @if (successMessage()) {
                  <div class="p-3 text-sm text-green-500 bg-green-500/10 rounded-md border border-green-500/20 text-center font-medium">
                    {{ successMessage() }}
                  </div>
                }

                <div class="flex flex-col gap-2 pt-2">
                  <button
                    hlmBtn
                    type="submit"
                    [disabled]="recoverForm.invalid || isLoading()"
                    class="w-full"
                  >
                    {{ isLoading() ? 'Sending reset link...' : 'Send reset link' }}
                  </button>
                </div>

                <div class="text-center text-sm mt-4 flex flex-col gap-2 pt-2">
                  <p class="text-muted-foreground text-xs">
                    Remembered your password?
                    <a routerLink="/auth/login" class="text-primary hover:underline font-semibold">
                      Sign in
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
export class RecoverComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AngularAuthService);
  private readonly router = inject(Router);

  public readonly recoverForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  public readonly isLoading = signal(false);
  public readonly errorMessage = signal<string | null>(null);
  public readonly successMessage = signal<string | null>(null);

  async onSubmit() {
    if (this.recoverForm.invalid) {
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      const { email } = this.recoverForm.value;
      await this.authService.resetPassword(email!);
      this.successMessage.set('Password reset link sent! Please check your email.');
    } catch (err) {
      this.errorMessage.set('An unexpected error occurred. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }
}

