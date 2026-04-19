const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString =
  'postgresql://postgres.lzkzfqshnjvlzosnntfx:UVYrurEWBDl6qVQ2@aws-1-us-west-2.pooler.supabase.com:5432/postgres';
const pool = new Pool({ connectionString });

async function applyMigration018() {
  const client = await pool.connect();
  try {
    console.log('Connected to PostgreSQL');

    const { rows: buckets } = await client.query(
      `SELECT id FROM storage.buckets WHERE id = 'thumbnails'`
    );
    if (buckets.length > 0) {
      console.log('Bucket `thumbnails` already exists — running migration idempotently');
    }

    const migrationPath = path.join(
      __dirname,
      '../supabase/migrations/018_thumbnails_storage_bucket.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log('✅ Migration 018 applied');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    const { rows: verify } = await client.query(
      `SELECT id, public FROM storage.buckets WHERE id = 'thumbnails'`
    );
    const { rows: policies } = await client.query(
      `SELECT policyname FROM pg_policies
       WHERE schemaname = 'storage' AND tablename = 'objects'
         AND policyname LIKE 'thumbnails_%'`
    );
    console.log('Bucket:', verify);
    console.log('Policies:', policies.map((r) => r.policyname));
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration018();
