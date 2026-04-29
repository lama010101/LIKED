const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Connection string candidates from audit-01.js pattern
const CANDIDATES = [
  'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
  'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:5432/postgres',
  'postgresql://postgres.lzkzfqshnjvlzosnntfx:UVYrurEWBDl6qVQ2@aws-1-us-west-2.pooler.supabase.com:5432/postgres',
  'postgresql://postgres:nAvfaukg6D9HiUjf@db.lzkzfqshnjvlzosnntfx.supabase.co:5432/postgres'
];

async function tryConnect() {
  for (const cs of CANDIDATES) {
    const pool = new Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      console.log('Connected via', cs.split('@')[1]);
      return { pool, client };
    } catch (e) {
      console.log('FAIL', cs.split('@')[1], '-', e.code || e.message.slice(0, 80));
      try { client.release(); await pool.end(); } catch {}
    }
  }
  throw new Error('No DB connection succeeded.');
}

async function applyMigration034() {
  const { pool, client } = await tryConnect();
  try {
    const migrationPath = path.join(
      __dirname,
      '../supabase/migrations/034_drop_duplicate_indexes.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log('✅ Migration 034 applied');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    // Verify indexes are dropped
    const { rows } = await client.query(`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('nodes', 'tag_translations', 'translations', 'user_node_preferences')
        AND indexname IN (
          'idx_nodes_title_gin',
          'idx_tag_translations_label_gin',
          'idx_translations_title_gin',
          'translations_node_lang_idx',
          'unsp_user_context_pos_idx'
        );
    `);
    console.log('Verification — dropped indexes remaining:', rows);
    if (rows.length === 0) {
      console.log('✅ All 5 duplicate indexes successfully dropped');
    } else {
      console.log('❌ Some indexes still exist:', rows);
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration034();
