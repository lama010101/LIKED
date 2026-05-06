const fs = require('fs');
const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const sql = fs.readFileSync('D:/LIKED/supabase/migrations/037_rls_causes_edges_write_policies.sql', 'utf8');
  await client.query(sql);

  const res = await client.query(`
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE tablename IN ('causes', 'edges')
    ORDER BY tablename, cmd, policyname;
  `);
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
