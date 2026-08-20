const fs = require('fs');
const path = require('path');

const SUPABASE_ACCESS_TOKEN = 'sbp_8f365f41d44a9140450ca199e55582d5b35ee38c';
const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';

async function checkGetFeed() {
  try {
    console.log('Checking current get_feed function state...');
    
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
            SELECT pg_get_functiondef(oid)
            FROM pg_proc
            WHERE proname = 'get_feed'
            ORDER BY oid DESC
            LIMIT 1;
          `
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Management API request failed: ${response.status} ${error}`);
    }

    const result = await response.json();
    console.log('Current get_feed function:');
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  }
}

checkGetFeed();
