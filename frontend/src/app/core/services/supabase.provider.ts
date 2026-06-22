import { Provider } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.tokens';

export function createSupabaseClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
}

export function provideSupabase(): Provider[] {
  return [
    {
      provide: SupabaseClient,
      useFactory: createSupabaseClient
    }
  ];
}
