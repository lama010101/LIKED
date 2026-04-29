const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: 'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:6543/postgres'
});

async function runQuery(tableName) {
  const query = `
    SELECT policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = $1
    ORDER BY policyname;
  `;
  
  const result = await pool.query(query, [tableName]);
  return result.rows;
}

async function main() {
  try {
    console.log('\n=== QUERY 1 — RLS policies on nodes ===');
    const nodesPolicies = await runQuery('nodes');
    console.log(JSON.stringify(nodesPolicies, null, 2));
    
    console.log('\n=== QUERY 2 — RLS policies on causes ===');
    const causesPolicies = await runQuery('causes');
    console.log(JSON.stringify(causesPolicies, null, 2));
    
    console.log('\n=== QUERY 3 — RLS policies on edges ===');
    const edgesPolicies = await runQuery('edges');
    console.log(JSON.stringify(edgesPolicies, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

main();
