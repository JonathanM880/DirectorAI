import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

describe('RLS Isolation Integration Tests', () => {
  let supabaseAdmin: SupabaseClient;
  let supabaseA: SupabaseClient;
  let supabaseB: SupabaseClient;
  let userA: any;
  let userB: any;

  beforeAll(async () => {
    const url = process.env['SUPABASE_URL'];
    const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY']; // We need service key to bypass RLS and create users
    const anonKey = process.env['SUPABASE_ANON_KEY'];

    if (!url || !anonKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
    }

    supabaseAdmin = createClient(url, serviceKey || anonKey);
    
    // Create User A
    const emailA = `test-a-${crypto.randomUUID()}@example.com`;
    const pwdA = 'TestPassword123!';
    const { data: authA, error: errA } = await supabaseAdmin.auth.admin.createUser({
      email: emailA,
      password: pwdA,
      email_confirm: true
    });
    if (errA) throw errA;
    userA = authA.user;
    
    supabaseA = createClient(url, anonKey);
    await supabaseA.auth.signInWithPassword({ email: emailA, password: pwdA });

    // Create User B
    const emailB = `test-b-${crypto.randomUUID()}@example.com`;
    const pwdB = 'TestPassword123!';
    const { data: authB, error: errB } = await supabaseAdmin.auth.admin.createUser({
      email: emailB,
      password: pwdB,
      email_confirm: true
    });
    if (errB) throw errB;
    userB = authB.user;

    supabaseB = createClient(url, anonKey);
    await supabaseB.auth.signInWithPassword({ email: emailB, password: pwdB });

    // Wait for triggers to create public.users records
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    // Cleanup if we have admin access
    if (process.env['SUPABASE_SERVICE_ROLE_KEY']) {
      if (userA) await supabaseAdmin.auth.admin.deleteUser(userA.id);
      if (userB) await supabaseAdmin.auth.admin.deleteUser(userB.id);
    }
  });

  it('7.3.1 User B cannot read User A\'s assets', async () => {
    expect(userA).toBeDefined();
    expect(userB).toBeDefined();

    // User A inserts an asset
    const { data: asset, error: insertError } = await supabaseA.from('assets').insert({
      user_id: userA.id,
      filename: 'secret-a.txt',
      mime_type: 'text/plain',
      storage_path: `assets/${userA.id}/secret-a.txt`,
      size_bytes: 100,
      source: 'user_upload'
    }).select().single();

    expect(insertError).toBeNull();
    expect(asset).toBeDefined();

    // User B tries to read the asset
    const { data: fetchedAssets, error: fetchError } = await supabaseB.from('assets').select('*').eq('id', asset.id);
    
    expect(fetchError).toBeNull(); // Query succeeds but returns empty
    expect(fetchedAssets).toHaveLength(0); // RLS filtered it out
  });

  it('7.3.2 User B cannot read User A\'s scheduled posts', async () => {
    // We need a channel first
    const { data: channel } = await supabaseA.from('channels').insert({
      user_id: userA.id,
      platform: 'twitter',
      name: 'My Twitter',
      channel_identifier: 'twitter123',
      is_active: true
    }).select().single();

    // User A inserts a scheduled post
    const { data: post, error: insertError } = await supabaseA.from('scheduled_posts').insert({
      user_id: userA.id,
      channel_id: channel.id,
      text_content: 'Hello world',
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      status: 'scheduled'
    }).select().single();

    expect(insertError).toBeNull();
    expect(post).toBeDefined();

    // User B tries to read the post
    const { data: fetchedPosts, error: fetchError } = await supabaseB.from('scheduled_posts').select('*').eq('id', post.id);
    
    expect(fetchError).toBeNull();
    expect(fetchedPosts).toHaveLength(0); // RLS filters it out
  });

  it('7.3.3 Cannot UPDATE audit_log (even as authenticated user)', async () => {
    // First let user A create an audit log
    const { data: log, error: insertError } = await supabaseA.from('audit_log').insert({
      user_id: userA.id,
      action: 'published',
      platform: 'twitter',
      metadata: { foo: 'bar' }
    }).select().single();

    expect(insertError).toBeNull();

    // Now try to update it
    const { data: updateData, error: updateError } = await supabaseA.from('audit_log').update({
      action: 'retried'
    }).eq('id', log.id).select();

    // Update should silently fail or return empty due to missing UPDATE policy
    expect(updateData).toBeNull();
    
    // Check it's unchanged
    const { data: unchangedLog } = await supabaseA.from('audit_log').select('*').eq('id', log.id).single();
    expect(unchangedLog.action).toBe('published');
  });

  it('7.3.4 Unauthenticated request to Edge Function returns HTTP 401', async () => {
    const url = process.env['SUPABASE_URL'];
    const anonKey = process.env['SUPABASE_ANON_KEY'];
    
    // We purposefully omit the Authorization header
    const response = await fetch(`${url}/functions/v1/gen-ai-studio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // No Authorization header
      },
      body: JSON.stringify({ action: 'ping' })
    });

    expect(response.status).toBe(401);
  });
});
