const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const query = `
      SELECT
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('nodes', 'tag_translations', 'translations', 'user_node_preferences')
      ORDER BY tablename, indexname;
    `;
    
    const result = await pool.query(query);
    console.log(JSON.stringify(result.rows, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

main();
