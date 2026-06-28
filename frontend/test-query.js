import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
  const { data, error } = await supabase
    .from('scheduled_posts')
    .select(`
      *,
      channels (
        platform
      ),
      recurrence_rules (
        id,
        user_id,
        frequency,
        interval,
        days_of_week,
        end_date,
        max_occurrences,
        created_at
      )
    `)
    .not('recurrence_rule_id', 'is', null)
    .in('status', ['scheduled', 'retrying', 'paused'])
    .order('scheduled_at', { ascending: true });

  console.log('Error:', error);
  console.log('Data:', JSON.stringify(data, null, 2));
}

testQuery();
