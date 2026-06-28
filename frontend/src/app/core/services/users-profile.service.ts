import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { UserProfile } from '@director-ai/types';

@Injectable({
  providedIn: 'root'
})
export class UsersProfileService {
  private supabase = inject(SupabaseClient);

  async getProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from('users_profile')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }

    if (!data) return null;

    return this.mapRow(data);
  }

  async createProfile(profile: { id: string; email: string; display_name?: string; avatar_url?: string; timezone?: string; plan_id?: string; onboarding_completed?: boolean }): Promise<UserProfile> {
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

  async updateProfile(userId: string, profile: Partial<Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>>): Promise<UserProfile> {
    // Map camelCase fields to snake_case for Supabase if needed
    const payload: any = {};
    if (profile.displayName !== undefined) payload.display_name = profile.displayName;
    if (profile.avatarUrl !== undefined) payload.avatar_url = profile.avatarUrl;
    if (profile.timezone !== undefined) payload.timezone = profile.timezone;
    if (profile.planId !== undefined) payload.plan_id = profile.planId;
    if (profile.onboardingCompleted !== undefined) payload.onboarding_completed = profile.onboardingCompleted;

    const { data, error } = await this.supabase
      .from('users_profile')
      .update(payload)
      .eq('id', userId)
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
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}
