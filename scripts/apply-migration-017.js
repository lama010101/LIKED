const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database connection using same credentials as check-db-state.js
const connectionString = 'postgresql://postgres.lzkzfqshnjvlzosnntfx:UVYrurEWBDl6qVQ2@aws-1-us-west-2.pooler.supabase.com:5432/postgres';
const pool = new Pool({ connectionString });

async function applyMigration017() {
  const client = await pool.connect();
  
  try {
    console.log('Connected to PostgreSQL database');
    
    // Check if table already exists
    const { rows: tables } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'user_node_preferences'
    `);
    
    if (tables.length > 0) {
      console.log('✅ Table user_node_preferences already exists');
      return;
    }
    
    console.log('Applying migration 017: user_node_preferences...');
    
    // Read and execute migration 017
    const migrationPath = path.join(__dirname, '../supabase/migrations/017_user_node_preferences.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    await client.query('BEGIN');
    
    try {
      await client.query(migrationSQL);
      await client.query('COMMIT');
      console.log('✅ Migration 017 applied successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    
    // Verify table exists
    const { rows: verifyTables } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'user_node_preferences'
    `);
    
    if (verifyTables.length > 0) {
      console.log('✅ Verification: Table user_node_preferences exists');
    } else {
      console.log('❌ Verification failed: Table still does not exist');
    }
    
  } catch (error) {
    console.error('❌ Error applying migration 017:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration017();
