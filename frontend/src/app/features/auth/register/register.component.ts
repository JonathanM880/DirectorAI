import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AngularAuthService } from '../../../core/services/auth.service';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';

@Component({
  selector: 'app-register',
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
              Create your account
            </p>
          </hlm-card-header>
          <div hlmCardContent>
            <form [formGroup]="registerForm" (ngSubmit)="onSubmit()" class="space-y-4">
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
                  @if (!(registerForm.controls.password.touched && registerForm.controls.password.invalid)) {
                    <hlm-field-description>Must be at least 8 characters long.</hlm-field-description>
                  }
                  <hlm-field-error validator="required">Password is required.</hlm-field-error>
                  <hlm-field-error validator="minlength">Password must be at least 8 characters long.</hlm-field-error>
                </hlm-field>

                <hlm-field>
                  <label hlmFieldLabel for="confirmPassword">Confirm Password</label>
                  <input
                    hlmInput
                    type="password"
                    id="confirmPassword"
                    placeholder="••••••••"
                    formControlName="confirmPassword"
                    class="w-full"
                  />
                  @if (
                    !(
                      registerForm.controls.confirmPassword.touched &&
                      (registerForm.controls.confirmPassword.invalid || registerForm.errors?.['passwordMismatch'])
                    )
                  ) {
                    <hlm-field-description>Please confirm your password.</hlm-field-description>
                  }
                  <hlm-field-error validator="required">Confirming your password is required.</hlm-field-error>
                  @if (registerForm.errors?.['passwordMismatch'] && !registerForm.controls.confirmPassword.errors?.['required']) {
                    <hlm-field-error forceShow>Passwords must match.</hlm-field-error>
                  }
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
                    [disabled]="registerForm.invalid || isLoading()"
                    class="w-full"
                  >
                    {{ isLoading() ? 'Creating account...' : 'Create account' }}
                  </button>
                </div>

                <div class="text-center text-sm mt-4 flex flex-col gap-2 pt-2">
                  <p class="text-muted-foreground text-xs">
                    Already have an account?
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
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AngularAuthService);
  private readonly router = inject(Router);

  public readonly registerForm = this.fb.group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordMatch() }
  );

  public readonly isLoading = signal(false);
  public readonly errorMessage = signal<string | null>(null);
  public readonly successMessage = signal<string | null>(null);

  async onSubmit() {
    if (this.registerForm.invalid) {
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    try {
      const { email, password } = this.registerForm.value;
      const result = await this.authService.signUp(email!, password!);

      if (result.error) {
        this.errorMessage.set(result.error.message);
        return;
      }

      if (result.session) {
        this.router.navigateByUrl('/');
      } else {
        this.successMessage.set('Account created! Please check your email to verify your account.');
      }
    } catch {
      this.errorMessage.set('An unexpected error occurred. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }
}

function passwordMatch(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get('password')?.value;
    const confirm = group.get('confirmPassword')?.value;
    return password === confirm ? null : { passwordMismatch: true };
  };
}

