const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://dnrbgoxvxkiczjtpdevu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRucmJnb3h2eGtpY3pqdHBkZXZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTc0MzU3NywiZXhwIjoyMDk3MzE5NTc3fQ.9tCtOUM50aZcRbBDM6-WujmJ19k2BFfg25KpDJakjU4'
);

async function check() {
  console.log('--- Checking DB Data ---');
  const { data: profiles, error: errProf } = await supabase.from('users_profile').select('*');
  console.log('Profiles:', profiles);

  const { data: subs, error: errSubs } = await supabase.from('subscriptions').select('*');
  console.log('Subscriptions:', subs);

  const { data: posts, error: errPosts } = await supabase.from('scheduled_posts').select('*');
  console.log('Scheduled Posts (total count):', posts?.length);
  if (posts?.length > 0) {
    console.log('Sample posts (first 3):', posts.slice(0, 3));
  }

  const { data: audits, error: errAudits } = await supabase.from('audit_log').select('*').order('occurred_at', { ascending: false }).limit(5);
  console.log('Recent Audits:', audits);
}

check();
