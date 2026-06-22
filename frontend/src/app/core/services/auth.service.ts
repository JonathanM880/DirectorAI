import { Injectable } from '@angular/core';
import { SupabaseClient, User, Session, AuthError } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';

type OAuthProvider = 'google' | 'github';

interface AuthResult {
  user: User | null;
  session: Session | null;
  error: { message: string; status?: number } | null;
}

type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'PASSWORD_RECOVERY' | 'USER_UPDATED';

interface AuthSubscription {
  unsubscribe(): void;
}

@Injectable({
  providedIn: 'root'
})
export class AngularAuthService {
  private authStateSubject = new BehaviorSubject<Session | null>(null);

  public authState$: Observable<Session | null> = this.authStateSubject.asObservable();

  constructor(private supabase: SupabaseClient) {
    this.initSession();

    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.authStateSubject.next(session);
    });
  }

  private async initSession() {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      if (error) {
        // Silent - session init failure
      }
      this.authStateSubject.next(session);
    } catch {
      // Silent - session init failure
    }
  }

  async signUp(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
    });
    return {
      user: data.user,
      session: data.session,
      error: error ? { message: error.message, status: error.status } : null,
    };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });
    return {
      user: data.user,
      session: data.session,
      error: error ? { message: error.message, status: error.status } : null,
    };
  }

  async signInWithOAuth(provider: OAuthProvider): Promise<void> {
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
