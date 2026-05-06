const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const res1 = await client.query(`
    SELECT
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual AS using_expr,
      with_check AS with_check_expr
    FROM pg_policies
    WHERE tablename IN ('causes', 'edges')
    ORDER BY tablename, cmd, policyname;
  `);
  console.log('---QUERY1_START---');
  console.log(JSON.stringify(res1.rows, null, 2));
  console.log('---QUERY1_END---');

  const res2 = await client.query(`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE tablename IN ('causes', 'edges');
  `);
  console.log('---QUERY2_START---');
  console.log(JSON.stringify(res2.rows, null, 2));
  console.log('---QUERY2_END---');

  await client.end();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
