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
              Crea tu cuenta
            </p>
          </hlm-card-header>
          <div hlmCardContent>
            <form [formGroup]="registerForm" (ngSubmit)="onSubmit()" class="space-y-4">
              <hlm-field-group class="space-y-4">
                <hlm-field>
                  <label hlmFieldLabel for="email">Correo electrónico</label>
                  <input
                    hlmInput
                    type="email"
                    id="email"
                    placeholder="tucorreo@ejemplo.com"
                    formControlName="email"
                    class="w-full"
                  />
                  <hlm-field-error validator="required">El correo electrónico es obligatorio.</hlm-field-error>
                  <hlm-field-error validator="email">Introduce una dirección de correo electrónico válida.</hlm-field-error>
                </hlm-field>

                <hlm-field>
                  <label hlmFieldLabel for="password">Contraseña</label>
                  <input
                    hlmInput
                    type="password"
                    id="password"
                    placeholder="••••••••"
                    formControlName="password"
                    class="w-full"
                  />
                  @if (!(registerForm.controls.password.touched && registerForm.controls.password.invalid)) {
                    <hlm-field-description>Debe tener al menos 8 caracteres.</hlm-field-description>
                  }
                  <hlm-field-error validator="required">La contraseña es obligatoria.</hlm-field-error>
                  <hlm-field-error validator="minlength">La contraseña debe tener al menos 8 caracteres.</hlm-field-error>
                </hlm-field>

                <hlm-field>
                  <label hlmFieldLabel for="confirmPassword">Confirmar contraseña</label>
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
                    <hlm-field-description>Por favor, confirma tu contraseña.</hlm-field-description>
                  }
                  <hlm-field-error validator="required">Es obligatorio confirmar tu contraseña.</hlm-field-error>
                  @if (registerForm.errors?.['passwordMismatch'] && !registerForm.controls.confirmPassword.errors?.['required']) {
                    <hlm-field-error forceShow>Las contraseñas deben coincidir.</hlm-field-error>
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
                    {{ isLoading() ? 'Creando cuenta...' : 'Crear cuenta' }}
                  </button>
                </div>

                <div class="text-center text-sm mt-4 flex flex-col gap-2 pt-2">
                  <p class="text-muted-foreground text-xs">
                    ¿Ya tienes una cuenta?
                    <a routerLink="/auth/login" class="text-primary hover:underline font-semibold">
                      Inicia sesión
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
        this.successMessage.set('¡Cuenta creada! Por favor, revisa tu correo electrónico para verificar tu cuenta.');
      }
    } catch {
      this.errorMessage.set('Ocurrió un error inesperado. Por favor, inténtalo de nuevo.');
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

