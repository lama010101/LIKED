const { Client } = require('pg');

const connectionString = 'postgresql://postgres.lzkzfqshnjvlzosnntfx:UVYrurEWBDl6qVQ2@aws-1-us-west-2.pooler.supabase.com:5432/postgres';

async function dropPolicies() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');

    // Get all existing policies
    const policies = await client.query(`
      SELECT tablename, policyname 
      FROM pg_policies 
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `);

    console.log(`\nDropping ${policies.rows.length} existing policies...`);

    for (const policy of policies.rows) {
      const dropSql = `DROP POLICY IF EXISTS "${policy.policyname}" ON "${policy.tablename}"`;
      await client.query(dropSql);
      console.log(`  ✓ Dropped: ${policy.tablename}.${policy.policyname}`);
    }

    console.log('\n✓ All existing policies dropped');

  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

dropPolicies();
