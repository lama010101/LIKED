const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres.lzkzfqshnjvlzosnntfx:UVYrurEWBDl6qVQ2@aws-1-us-west-2.pooler.supabase.com:5432/postgres';

const migrations = [
  'supabase/migrations/001_initial_schema.sql',
  'supabase/migrations/002_rls.sql',
  'supabase/migrations/003_rls_policies.sql',
  'supabase/migrations/004_rpc_create_node.sql',
  'supabase/seed.sql'
];

async function applyMigrations() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');

    for (const migration of migrations) {
      console.log(`\nApplying: ${migration}`);
      
      const sql = fs.readFileSync(path.join(__dirname, '..', migration), 'utf8');
      
      try {
        await client.query(sql);
        console.log(`✓ Successfully applied: ${migration}`);
      } catch (error) {
        console.error(`✗ Error applying ${migration}:`);
        console.error(error.message);
        console.error(error.detail);
        throw error;
      }
    }

    console.log('\n--- Verification ---');
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log(`\nTables created: ${result.rows.length}`);
    console.log(result.rows.map(r => r.table_name).join('\n'));
    
    if (result.rows.length === 27) {
      console.log('\n✓ Verification successful: 27 tables created');
    } else {
      console.log(`\n⚠ Expected 27 tables, found ${result.rows.length}`);
    }

  } catch (error) {
    console.error('\nFatal error:');
    console.error(error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigrations();
