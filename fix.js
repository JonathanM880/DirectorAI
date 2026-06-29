const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://dnrbgoxvxkiczjtpdevu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRucmJnb3h2eGtpY3pqdHBkZXZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTc0MzU3NywiZXhwIjoyMDk3MzE5NTc3fQ.9tCtOUM50aZcRbBDM6-WujmJ19k2BFfg25KpDJakjU4'
);
async function sync() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) { console.error('Auth err:', error); return; }
  for (const u of data.users) {
    const { error: insErr } = await supabase.from('users_profile').upsert({ id: u.id, email: u.email });
    console.log(u.id, insErr ? 'fail ' + insErr.message : 'ok');
  }
}
sync();
