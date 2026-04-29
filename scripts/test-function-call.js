const { Pool } = require('pg');

// Connection string from successful migration application
const CONNECTION_STRING = 'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:6543/postgres';

async function testFunctionCall() {
  const pool = new Pool({ 
    connectionString: CONNECTION_STRING, 
    ssl: { rejectUnauthorized: false } 
  });
  const client = await pool.connect();
  try {
    console.log('Testing create_node_with_metadata function call...');
    
    const { rows } = await client.query(`
      SELECT * FROM create_node_with_metadata(
        (SELECT id FROM users LIMIT 1),
        'https://example.com',
        NULL,
        'Test title',
        NULL,
        'en',
        ARRAY['test']::TEXT[]
      );
    `);
    
    console.log('✅ Function call succeeded');
    console.log('Result:');
    console.table(rows);
  } catch (e) {
    console.error('❌ Function call failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

testFunctionCall();
