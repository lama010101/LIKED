const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString =
  'postgresql://postgres.lzkzfqshnjvlzosnntfx:UVYrurEWBDl6qVQ2@aws-1-us-west-2.pooler.supabase.com:5432/postgres';
const pool = new Pool({ connectionString });

async function applyMigration019() {
  const client = await pool.connect();
  try {
    console.log('Connected to PostgreSQL');

    const migrationPath = path.join(
      __dirname,
      '../supabase/migrations/019_create_node_with_metadata.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log('✅ Migration 019 applied');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    const { rows } = await client.query(
      `SELECT proname FROM pg_proc WHERE proname IN ('create_node_with_metadata', 'liked_tag_palette')`
    );
    console.log('Functions:', rows.map((r) => r.proname));
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration019();
