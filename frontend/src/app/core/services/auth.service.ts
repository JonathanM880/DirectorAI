import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { AuthServiceImpl } from '../../../../../supabase/functions/_shared/auth.service';
import { AuthService, AuthResult, OAuthProvider, AuthEvent, User, Session } from '@director-ai/types';

// Staging configuration fallback
const SUPABASE_URL = 'https://dnrbgoxvxkiczjtpdevu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRucmJnb3h2eGtpY3pqdHBkZXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NDM1NzcsImV4cCI6MjA5NzMxOTU3N30.OMAjndlkrYZcU9dkBYOyO8UzW3CqmPpgGFbk5qXG-EA';

@Injectable({
  providedIn: 'root'
})
export class AngularAuthService {
  private supabase: SupabaseClient;
  private authService: AuthService;
  private authStateSubject = new BehaviorSubject<Session | null>(null);

  public authState$: Observable<Session | null> = this.authStateSubject.asObservable();

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
    this.authService = new AuthServiceImpl(this.supabase);

    this.initSession();

    this.authService.onAuthStateChange((event: AuthEvent, session: Session | null) => {
      this.authStateSubject.next(session);
    });
  }

  private async initSession() {
    try {
      const session = await this.authService.getSession();
      this.authStateSubject.next(session);
    } catch (e) {
      console.error('Failed to retrieve initial session:', e);
    }
  }

  async signUp(email: string, password: string): Promise<AuthResult> {
    return this.authService.signUp(email, password);
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    return this.authService.signIn(email, password);
  }

  async signInWithOAuth(provider: OAuthProvider): Promise<void> {
    return this.authService.signInWithOAuth(provider);
  }

  async signOut(): Promise<void> {
    await this.authService.signOut();
  }

  async resetPassword(email: string): Promise<void> {
    return this.authService.resetPassword(email);
  }

  async getSession(): Promise<Session | null> {
    return this.authService.getSession();
  }

  async getUser(): Promise<User | null> {
    return this.authService.getUser();
  }
}
