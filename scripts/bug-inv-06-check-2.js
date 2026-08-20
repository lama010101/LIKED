const fs = require('fs');
const path = require('path');

const SUPABASE_ACCESS_TOKEN = 'sbp_8f365f41d44a9140450ca199e55582d5b35ee38c';
const PROJECT_REF = 'lzkzfqshnjvlzosnntfx';

async function checkGetFeedSignature() {
  try {
    console.log('=== CHECK 2: Current get_feed signature ===');
    
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
    console.log('get_feed signature (first 40 lines):');
    const funcDef = result[0]?.pg_get_functiondef;
    if (funcDef) {
      const lines = funcDef.split('\n').slice(0, 40);
      console.log(lines.join('\n'));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  }
}

checkGetFeedSignature();
