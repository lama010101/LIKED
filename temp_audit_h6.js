const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const res = await client.query(`
    SELECT proname, pg_get_function_arguments(oid) AS arguments, prosecdef
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('update_user_profile', 'update_profile', 'update_avatar', 'upsert_user_profile')
    ORDER BY proname;
  `);

  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
