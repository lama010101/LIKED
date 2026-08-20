const SUPABASE_ACCESS_TOKEN = 'sbp_8f365f41d44a9140450ca199e55582d5b35ee38c';
const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';

async function verifyMigration() {
  try {
    console.log('Verifying get_feed with test query...');
    
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
            SELECT count(*) FROM get_feed(
              p_user_id := (SELECT id FROM users ORDER BY created_at LIMIT 1),
              p_exclude_foldered := false,
              p_limit := 3
            );
          `
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Management API request failed: ${response.status} ${error}`);
    }

    const result = await response.json();
    console.log('✓ Verification successful');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  }
}

verifyMigration();
