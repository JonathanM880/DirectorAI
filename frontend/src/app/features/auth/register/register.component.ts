import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AngularAuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <h1>DirectorAI</h1>
        <p class="subtitle">Create your account</p>

        <form [formGroup]="registerForm" (ngSubmit)="onSubmit()" class="auth-form">
          <div class="form-group">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              formControlName="email"
              placeholder="you@example.com"
              [class.error]="registerForm.get('email')?.invalid && registerForm.get('email')?.touched"
            />
            @if (registerForm.get('email')?.invalid && registerForm.get('email')?.touched) {
              <span class="error-message">Please enter a valid email</span>
            }
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              id="password"
              type="password"
              formControlName="password"
              placeholder="••••••••"
              [class.error]="registerForm.get('password')?.invalid && registerForm.get('password')?.touched"
            />
            @if (registerForm.get('password')?.invalid && registerForm.get('password')?.touched) {
              <span class="error-message">Password must be at least 8 characters</span>
            }
          </div>

          <div class="form-group">
            <label for="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              formControlName="confirmPassword"
              placeholder="••••••••"
              [class.error]="registerForm.get('confirmPassword')?.invalid && registerForm.get('confirmPassword')?.touched"
            />
            @if (registerForm.get('confirmPassword')?.touched && registerForm.errors?.['mismatch']) {
              <span class="error-message">Passwords do not match</span>
            }
          </div>

          @if (errorMessage) {
            <div class="error-banner">{{ errorMessage }}</div>
          }

          @if (successMessage) {
            <div class="success-banner">{{ successMessage }}</div>
          }

          <button type="submit" [disabled]="registerForm.invalid || isLoading" class="submit-btn">
            {{ isLoading ? 'Creating account...' : 'Create account' }}
          </button>
        </form>

        <div class="auth-links">
          <a routerLink="/auth/login">Already have an account? Sign in</a>
        </div>
      </div>
    </div>
  `,
  styleUrl: '../login/login.component.scss'
})
export class RegisterComponent {
  registerForm: FormGroup;
  isLoading = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: AngularAuthService,
    private router: Router
  ) {
    this.registerForm = this.fb.group(
      {
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', Validators.required]
      },
      { validators: this.passwordMatchValidator }
    );
  }

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { mismatch: true };
  }

  async onSubmit() {
    if (this.registerForm.invalid) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;

    try {
      console.log('Starting sign up...');
      const { email, password } = this.registerForm.value;
      console.log('Calling authService.signUp with email:', email);
      
      const result = await this.authService.signUp(email, password);
      console.log('Sign up result:', result);

      if (result.error) {
        console.error('Sign up error:', result.error);
        this.errorMessage = result.error.message;
        return;
      }

      if (result.session) {
        console.log('Session created, navigating...');
        this.router.navigateByUrl('/');
      } else {
        this.successMessage = 'Account created! Please check your email to verify your account.';
      }
    } catch (err) {
      console.error('Unexpected error during sign up:', err);
      this.errorMessage = 'An unexpected error occurred. Please try again.';
    } finally {
      console.log('Setting isLoading to false');
      this.isLoading = false;
    }
  }
}
