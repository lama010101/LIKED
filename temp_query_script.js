const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runQuery() {
  try {
    const { data, error } = await supabase
      .from('nodes')
      .select('id, url, title, thumbnail_key')
      .or('title.ilike.%NOUS%,title.ilike.%FEMALE%,url.ilike.%suno%')
      .limit(5);
    
    if (error) {
      console.error('Error executing query:', error);
      return;
    }
    
    console.log('\nQuery Results:');
    console.log('id | url | title | thumbnail_key');
    console.log('---|-----|-------|---------------');
    
    data.forEach(row => {
      const url = row.url || 'NULL';
      const title = row.title || 'NULL';
      const thumbnail = row.thumbnail_key || 'NULL';
      console.log(`${row.id} | ${url} | ${title} | ${thumbnail}`);
    });

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

runQuery();
