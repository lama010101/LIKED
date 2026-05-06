const fs = require('fs');
const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const sql = fs.readFileSync('D:/LIKED/supabase/migrations/038_atomic_profile_rpcs.sql', 'utf8');
  await client.query(sql);

  const res = await client.query(`
    SELECT proname FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('update_display_name', 'update_avatar_key');
  `);
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
