const fs = require('fs');
const path = require('path');

const SUPABASE_ACCESS_TOKEN = 'sbp_8f365f41d44a9140450ca199e55582d5b35ee38c';
const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';

async function applyMigration049() {
  try {
    console.log('Reading migration file...');
    const migrationPath = path.join(
      __dirname,
      '../supabase/migrations/049_get_feed_exclude_foldered.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Applying migration 049 via Management API...');
    
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Management API request failed: ${response.status} ${error}`);
    }

    const result = await response.json();
    console.log('✅ Migration 049 applied successfully');
    console.log('Result:', result);

    // Verify the function was updated
    console.log('\nVerifying get_feed function signature...');
    const verifyResponse = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            SELECT proname, pronargs, proargnames
            FROM pg_proc
            WHERE proname = 'get_feed';
          `
        }),
      }
    );

    if (verifyResponse.ok) {
      const verifyResult = await verifyResponse.json();
      console.log('get_feed function signature:', verifyResult);
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  }
}

applyMigration049();
