const SUPABASE_ACCESS_TOKEN = 'sbp_8f365f41d44a9140450ca199e55582d5b35ee38c';
const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';

async function checkFolderFeed() {
  try {
    console.log('=== CHECK 1: Running folder feed query directly in DB ===\n');
    
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            SELECT * FROM get_feed(
              p_user_id := (SELECT id FROM users ORDER BY created_at LIMIT 1),
              p_folder_id := (SELECT id FROM folders WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1),
              p_exclude_foldered := false,
              p_limit := 5
            );
          `
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Query failed:', response.status, error);
      process.exitCode = 1;
      return;
    }

    const result = await response.json();
    console.log('✓ Query successful');
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('\nRow count:', result.length);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  }
}

checkFolderFeed();
