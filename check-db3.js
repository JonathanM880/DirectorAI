const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://dnrbgoxvxkiczjtpdevu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRucmJnb3h2eGtpY3pqdHBkZXZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTc0MzU3NywiZXhwIjoyMDk3MzE5NTc3fQ.9tCtOUM50aZcRbBDM6-WujmJ19k2BFfg25KpDJakjU4'
);

async function check() {
  const { data: assets, error } = await supabase.from('assets').select('*').order('created_at', { ascending: false }).limit(5);
  console.log(assets.map(a => ({ id: a.id, created_at: a.created_at, filename: a.filename, mime_type: a.mime_type })));
}
check();
