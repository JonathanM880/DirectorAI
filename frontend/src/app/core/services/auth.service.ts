import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, AuthError, User, Session } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';

// Staging configuration fallback
const SUPABASE_URL = 'https://dnrbgoxvxkiczjtpdevu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRucmJnb3h2eGtpY3pqdHBkZXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NDM1NzcsImV4cCI6MjA5NzMxOTU3N30.OMAjndlkrYZcU9dkBYOyO8UzW3CqmPpgGFbk5qXG-EA';

interface AuthResult {
  user: User | null;
  session: Session | null;
  error: { message: string; status?: number } | null;
}

type OAuthProvider = 'google' | 'github' | 'email';

type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'PASSWORD_RECOVERY' | 'USER_UPDATED';

interface AuthSubscription {
  unsubscribe(): void;
}

@Injectable({
  providedIn: 'root'
})
export class AngularAuthService {
  private supabase: SupabaseClient;
  private authStateSubject = new BehaviorSubject<Session | null>(null);

  public authState$: Observable<Session | null> = this.authStateSubject.asObservable();

  constructor() {
    console.log('Initializing AngularAuthService...');
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
    console.log('Supabase client created');

    this.initSession();

    this.supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session);
      this.authStateSubject.next(session);
    });
  }

  private async initSession() {
    try {
      console.log('Getting initial session...');
      const { data: { session }, error } = await this.supabase.auth.getSession();
      if (error) {
        console.error('Error getting session:', error);
      }
      console.log('Initial session:', session);
      this.authStateSubject.next(session);
    } catch (e) {
      console.error('Failed to retrieve initial session:', e);
    }
  }

  async signUp(email: string, password: string): Promise<AuthResult> {
    console.log('Signing up with email:', email);
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
    });
    console.log('Sign up response:', data, error);
    return {
      user: data.user,
      session: data.session,
      error: error ? { message: error.message, status: error.status } : null,
    };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    console.log('Signing in with email:', email);
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });
    console.log('Sign in response:', data, error);
    return {
      user: data.user,
      session: data.session,
      error: error ? { message: error.message, status: error.status } : null,
    };
  }

  async signInWithOAuth(provider: OAuthProvider): Promise<void> {
    console.log('Signing in with OAuth:', provider);
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider,
    });
    if (error) {
      throw error;
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email);
    if (error) {
      throw error;
    }
  }

  async getSession(): Promise<Session | null> {
    const { data: { session } } = await this.supabase.auth.getSession();
    return session;
  }

  async getUser(): Promise<User | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    return user;
  }
}
