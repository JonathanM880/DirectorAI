const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321', // Local default
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function sync() {
  const { data: users, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    console.error('Auth Error:', authErr);
    return;
  }
  for (const user of users.users) {
    console.log('Syncing user:', user.id);
    const { error } = await supabase.from('users_profile').upsert({
      id: user.id,
      email: user.email
    });
    if (error) console.error('Upsert Error for', user.id, error);
    else console.log('Success for', user.id);
  }
}
sync();
