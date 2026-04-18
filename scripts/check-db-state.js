const { Client } = require('pg');

const connectionString = 'postgresql://postgres.lzkzfqshnjvlzosnntfx:UVYrurEWBDl6qVQ2@aws-1-us-west-2.pooler.supabase.com:5432/postgres';

async function checkState() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');

    // Check tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log(`\nTables: ${tables.rows.length}`);
    tables.rows.forEach(r => console.log(`  - ${r.table_name}`));

    // Check RLS policies
    const policies = await client.query(`
      SELECT schemaname, tablename, policyname 
      FROM pg_policies 
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `);
    console.log(`\nRLS Policies: ${policies.rows.length}`);
    policies.rows.forEach(r => console.log(`  - ${r.tablename}: ${r.policyname}`));

    // Check RPC functions
    const functions = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_type = 'FUNCTION'
      ORDER BY routine_name
    `);
    console.log(`\nRPC Functions: ${functions.rows.length}`);
    functions.rows.forEach(r => console.log(`  - ${r.routine_name}`));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkState();
