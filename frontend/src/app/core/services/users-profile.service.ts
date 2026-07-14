import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { UserProfile } from '@director-ai/types';

@Injectable({
  providedIn: 'root'
})
export class UsersProfileService {
  private supabase = inject(SupabaseClient);

  async getProfile(): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from('users_profile')
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }

    if (!data) {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session?.user) {
        try {
          const profile = {
            id: session.user.id,
            email: session.user.email || '',
            display_name: session.user.user_metadata?.['full_name'] || session.user.user_metadata?.['name'] || '',
            avatar_url: session.user.user_metadata?.['avatar_url'] || '',
            timezone: 'UTC',
            plan_id: 'free',
            onboarding_completed: false,
            ai_generations_usage: 0,
            ai_generations_limit: 10
          };
          return await this.createProfile(profile);
        } catch (createError) {
          console.error('Error auto-creating profile in getProfile:', createError);
          return null;
        }
      }
      return null;
    }

    return this.mapRow(data);
  }

  async createProfile(profile: { id: string; email: string; display_name?: string; avatar_url?: string; timezone?: string; plan_id?: string; onboarding_completed?: boolean; ai_generations_usage?: number; ai_generations_limit?: number }): Promise<UserProfile> {
    const { data, error } = await this.supabase
      .from('users_profile')
      .insert(profile)
      .select()
      .single();

    if (error) {
      console.error('Error creating user profile:', error);
      throw error;
    }

    return this.mapRow(data);
  }

  async updateProfile(profile: Partial<Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>>): Promise<UserProfile> {
    // Map camelCase fields to snake_case for Supabase if needed
    const payload: any = {};
    if (profile.displayName !== undefined) payload.display_name = profile.displayName;
    if (profile.avatarUrl !== undefined) payload.avatar_url = profile.avatarUrl;
    if (profile.timezone !== undefined) payload.timezone = profile.timezone;
    if (profile.planId !== undefined) payload.plan_id = profile.planId;
    if (profile.onboardingCompleted !== undefined) payload.onboarding_completed = profile.onboardingCompleted;
    if (profile.aiGenerationsUsage !== undefined) payload.ai_generations_usage = profile.aiGenerationsUsage;
    if (profile.aiGenerationsLimit !== undefined) payload.ai_generations_limit = profile.aiGenerationsLimit;

    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session?.user) throw new Error('No user session');

    const { data, error } = await this.supabase
      .from('users_profile')
      .update(payload)
      .eq('id', session.user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }

    return this.mapRow(data);
  }

  private mapRow(row: any): UserProfile {
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      timezone: row.timezone,
      planId: row.plan_id,
      onboardingCompleted: row.onboarding_completed,
      aiGenerationsUsage: row.ai_generations_usage ?? 0,
      aiGenerationsLimit: row.ai_generations_limit ?? 10,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}
