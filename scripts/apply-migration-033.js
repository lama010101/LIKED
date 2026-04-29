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

async function applyMigration033() {
  const { pool, client } = await tryConnect();
  try {
    const migrationPath = path.join(
      __dirname,
      '../supabase/migrations/033_drop_duplicate_rls.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log('✅ Migration 033 applied');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    // Verify policies are dropped
    const { rows: nodesRows } = await client.query(`
      SELECT policyname, cmd
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'nodes'
      ORDER BY policyname;
    `);
    console.log('Verification A — nodes policies:', nodesRows);

    const { rows: causesRows } = await client.query(`
      SELECT policyname, cmd
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'causes'
      ORDER BY policyname;
    `);
    console.log('Verification B — causes policies:', causesRows);

    const { rows: edgesRows } = await client.query(`
      SELECT policyname, cmd
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'edges'
      ORDER BY policyname;
    `);
    console.log('Verification C — edges policies:', edgesRows);

    // Expected: nodes (4), causes (1), edges (1)
    if (nodesRows.length === 4 && causesRows.length === 1 && edgesRows.length === 1) {
      console.log('✅ All verification checks passed');
    } else {
      console.log('❌ Verification failed — unexpected policy counts');
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration033();
