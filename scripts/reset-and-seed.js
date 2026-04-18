const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres.lzkzfqshnjvlzosnntfx:UVYrurEWBDl6qVQ2@aws-1-us-west-2.pooler.supabase.com:5432/postgres';

async function run() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('Connected');

    // Clear all seed data in dependency order
    console.log('\nClearing existing seed data...');
    await client.query(`
      DELETE FROM tag_edges;
      DELETE FROM tag_translations;
      DELETE FROM tags;
      DELETE FROM folder_tree;
      DELETE FROM folder_edges;
      DELETE FROM folders;
      DELETE FROM group_members;
      DELETE FROM group_admins;
      DELETE FROM group_nodes;
      DELETE FROM groups;
      DELETE FROM nodes_sort_cache;
      DELETE FROM nodes;
      DELETE FROM users;
    `);
    console.log('✓ Cleared');

    // Apply seed
    console.log('\nApplying seed.sql...');
    const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'seed.sql'), 'utf8');
    await client.query(sql);
    console.log('✓ Seed applied');

    // Verify
    const result = await client.query(`
      SELECT 'users'   AS t, count(*)::int AS n FROM users
      UNION ALL SELECT 'nodes',   count(*)::int FROM nodes
      UNION ALL SELECT 'groups',  count(*)::int FROM groups
      UNION ALL SELECT 'folders', count(*)::int FROM folders
      UNION ALL SELECT 'tags',    count(*)::int FROM tags
      ORDER BY t
    `);

    console.log('\n--- Seed Counts ---');
    let allGood = true;
    const expected = { folders: 10, groups: 4, nodes: 20, tags: 12, users: 12 };
    for (const row of result.rows) {
      const exp = expected[row.t];
      const ok = row.n === exp;
      if (!ok) allGood = false;
      console.log(`  ${ok ? '✓' : '✗'} ${row.t}: ${row.n} (expected ${exp})`);
    }

    if (allGood) {
      console.log('\n✓ All seed counts correct');
    } else {
      console.log('\n✗ Some counts incorrect');
      process.exit(1);
    }

  } catch (err) {
    console.error('\n✗ Error:', err.message);
    if (err.detail) console.error('  Detail:', err.detail);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
