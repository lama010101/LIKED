const { Pool } = require('pg');

// Connection string from successful migration application
const CONNECTION_STRING = 'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:6543/postgres';

async function deleteTestNode() {
  const pool = new Pool({ 
    connectionString: CONNECTION_STRING, 
    ssl: { rejectUnauthorized: false } 
  });
  const client = await pool.connect();
  try {
    console.log('Deleting test node...');
    
    // Delete from tag_edges (has foreign key to nodes)
    const { rowCount: edgesRowCount } = await client.query(`
      DELETE FROM tag_edges 
      WHERE node_id IN (
        SELECT id FROM nodes 
        WHERE url = 'https://example.com' 
        AND title = 'Test title'
      );
    `);
    console.log(`Deleted ${edgesRowCount} row(s) from tag_edges`);
    
    // Delete from nodes_sort_cache (has foreign key to nodes)
    const { rowCount: cacheRowCount } = await client.query(`
      DELETE FROM nodes_sort_cache 
      WHERE node_id IN (
        SELECT id FROM nodes 
        WHERE url = 'https://example.com' 
        AND title = 'Test title'
      );
    `);
    console.log(`Deleted ${cacheRowCount} row(s) from nodes_sort_cache`);
    
    // Then delete from nodes
    const { rowCount } = await client.query(`
      DELETE FROM nodes 
      WHERE url = 'https://example.com' 
      AND title = 'Test title';
    `);
    
    console.log(`✅ Deleted ${rowCount} row(s) from nodes`);
    console.log(`Row count deleted: ${rowCount}`);
  } catch (e) {
    console.error('❌ Delete failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

deleteTestNode();
