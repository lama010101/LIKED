const fs = require('fs');
const path = require('path');

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';

async function applyMigration() {
  try {
    console.log('Applying migration 051_restore_get_feed.sql...');
    
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/051_restore_get_feed.sql'),
      'utf8'
    );
    
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: migrationSQL
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Management API request failed: ${response.status} ${error}`);
    }

    const result = await response.json();
    console.log('✓ Migration 051 applied successfully');
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  }
}

applyMigration();
