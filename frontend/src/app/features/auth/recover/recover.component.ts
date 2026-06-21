import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AngularAuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-recover',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <h1>DirectorAI</h1>
        <p class="subtitle">Reset your password</p>

        <form [formGroup]="recoverForm" (ngSubmit)="onSubmit()" class="auth-form">
          <div class="form-group">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              formControlName="email"
              placeholder="you@example.com"
              [class.error]="recoverForm.get('email')?.invalid && recoverForm.get('email')?.touched"
            />
            @if (recoverForm.get('email')?.invalid && recoverForm.get('email')?.touched) {
              <span class="error-message">Please enter a valid email</span>
            }
          </div>

          @if (errorMessage) {
            <div class="error-banner">{{ errorMessage }}</div>
          }

          @if (successMessage) {
            <div class="success-banner">{{ successMessage }}</div>
          }

          <button type="submit" [disabled]="recoverForm.invalid || isLoading" class="submit-btn">
            {{ isLoading ? 'Sending reset link...' : 'Send reset link' }}
          </button>
        </form>

        <div class="auth-links">
          <a routerLink="/auth/login">Back to sign in</a>
        </div>
      </div>
    </div>
  `,
  styleUrl: '../login/login.component.scss'
})
export class RecoverComponent {
  recoverForm: FormGroup;
  isLoading = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: AngularAuthService,
    private router: Router
  ) {
    this.recoverForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  async onSubmit() {
    if (this.recoverForm.invalid) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;

    try {
      const { email } = this.recoverForm.value;
      await this.authService.resetPassword(email);
      this.successMessage = 'Password reset link sent! Please check your email.';
    } catch (err) {
      this.errorMessage = 'An unexpected error occurred. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }
}
