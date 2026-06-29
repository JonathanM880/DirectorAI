import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { AuthService, AuthResult, OAuthProvider, AuthEvent, User, Session, AuthSubscription } from '../../../packages/types/index.ts'

export class AuthServiceImpl implements AuthService {
  constructor(private supabase: SupabaseClient) {}

  async signUp(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
    })
    return {
      user: data.user ? (data.user as any as User) : null,
      session: data.session ? (data.session as any as Session) : null,
      error: error ? { message: error.message, status: error.status } : null,
    }
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    })
    return {
      user: data.user ? (data.user as any as User) : null,
      session: data.session ? (data.session as any as Session) : null,
      error: error ? { message: error.message, status: error.status } : null,
    }
  }

  async signInWithOAuth(provider: OAuthProvider): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider,
    })
    if (error) {
      throw error
    }
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut()
    if (error) {
      throw error
    }
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email)
    if (error) {
      throw error
    }
  }

  async getSession(): Promise<Session | null> {
    const { data, error } = await this.supabase.auth.getSession()
    if (error || !data.session) {
      return null
    }
    return data.session as any as Session
  }

  async getUser(): Promise<User | null> {
    const { data, error } = await this.supabase.auth.getUser()
    if (error || !data.user) {
      return null
    }
    return data.user as any as User
  }

  onAuthStateChange(
    callback: (event: AuthEvent, session: Session | null) => void
  ): AuthSubscription {
    const { data } = this.supabase.auth.onAuthStateChange((event, session) => {
      let mappedEvent: AuthEvent
      if (event === 'SIGNED_IN') {
        mappedEvent = 'SIGNED_IN'
      } else if (event === 'SIGNED_OUT') {
        mappedEvent = 'SIGNED_OUT'
      } else if (event === 'TOKEN_REFRESHED') {
        mappedEvent = 'TOKEN_REFRESHED'
      } else if (event === 'PASSWORD_RECOVERY') {
        mappedEvent = 'PASSWORD_RECOVERY'
      } else {
        mappedEvent = event as any as AuthEvent
      }
      callback(mappedEvent, session ? (session as any as Session) : null)
    })
    return data.subscription
  }
}
