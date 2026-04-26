const { Pool } = require('pg');

const connectionString = 'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:6543/postgres';
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

(async () => {
  const client = await pool.connect();
  const tests = [];
  const userId = '00000000-0000-0000-0000-000000000000';

  function test(name, fn) {
    tests.push((async () => {
      try {
        await fn();
        console.log(`✅ ${name}`);
      } catch (e) {
        console.error(`❌ ${name}: ${e.message}`);
        process.exitCode = 1;
      }
    })());
  }

  // get_feed tests
  test('get_feed newest', () => client.query(`SELECT * FROM get_feed('${userId}'::uuid, 'en', 'all', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'newest', NULL, NULL, 10)`));
  test('get_feed oldest', () => client.query(`SELECT * FROM get_feed('${userId}'::uuid, 'en', 'all', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'oldest', NULL, NULL, 10)`));
  test('get_feed most_shared', () => client.query(`SELECT * FROM get_feed('${userId}'::uuid, 'en', 'all', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'most_shared', NULL, NULL, 10)`));
  test('get_feed highest_rated', () => client.query(`SELECT * FROM get_feed('${userId}'::uuid, 'en', 'all', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'highest_rated', NULL, NULL, 10)`));
  test('get_feed custom', () => client.query(`SELECT * FROM get_feed('${userId}'::uuid, 'en', 'all', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'custom', NULL, NULL, 10)`));
  test('get_feed with search', () => client.query(`SELECT * FROM get_feed('${userId}'::uuid, 'en', 'all', NULL, NULL, NULL, NULL, NULL, NULL, 'test', 'newest', NULL, NULL, 10)`));
  test('get_feed with view=mine', () => client.query(`SELECT * FROM get_feed('${userId}'::uuid, 'en', 'mine', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'newest', NULL, NULL, 10)`));
  test('get_feed with view=received', () => client.query(`SELECT * FROM get_feed('${userId}'::uuid, 'en', 'received', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'newest', NULL, NULL, 10)`));
  test('get_feed with limit=0', () => client.query(`SELECT * FROM get_feed('${userId}'::uuid, 'en', 'all', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'newest', NULL, NULL, 0)`));

  // search_nodes tests
  test('search_nodes empty query', () => client.query(`SELECT * FROM search_nodes('${userId}'::uuid, '', 'en', 'newest', 'all', 'all')`));
  test('search_nodes with query', () => client.query(`SELECT * FROM search_nodes('${userId}'::uuid, 'test', 'en', 'newest', 'all', 'all')`));

  await Promise.all(tests);
  client.release();
  await pool.end();
})();
