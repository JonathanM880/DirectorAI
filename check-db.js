const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://dnrbgoxvxkiczjtpdevu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRucmJnb3h2eGtpY3pqdHBkZXZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTc0MzU3NywiZXhwIjoyMDk3MzE5NTc3fQ.9tCtOUM50aZcRbBDM6-WujmJ19k2BFfg25KpDJakjU4'
);

async function check() {
  const { data: assets, error } = await supabase.from('assets').select('*');
  console.log('Assets count:', assets?.length);
  if (assets?.length > 0) {
    console.log('Sample asset:', assets[0]);
  } else {
    console.error('Error:', error);
  }
}
check();
