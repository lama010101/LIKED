const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const poolerUrl = 'postgresql://postgres.lzkzfqshnjvlzosnntfx:nAvfaukg6D9HiUjf@aws-1-us-west-2.pooler.supabase.com:6543/postgres';
const client = new Client({
  connectionString: poolerUrl,
  ssl: { rejectUnauthorized: false }
});

const fs = require('fs');
const outputPath = 'd:\\LIKED\\scripts\\schema-dump.txt';
let output = '';
function log(line) {
  output += line + '\n';
}

async function listSchemas() {
  await client.connect();

  const tablesRes = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  for (const row of tablesRes.rows) {
    const table = row.table_name;
    log('\n=== Table: ' + table + ' ===');

    const colsRes = await client.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table]);

    for (const col of colsRes.rows) {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = col.column_default ? ' DEFAULT ' + col.column_default : '';
      const maxLen = col.character_maximum_length ? '(' + col.character_maximum_length + ')' : '';
      log('  ' + col.column_name + ': ' + col.data_type + maxLen + ' ' + nullable + defaultVal);
    }

    const pkRes = await client.query(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
      ORDER BY kcu.ordinal_position
    `, [table]);
    if (pkRes.rows.length > 0) {
      log('  [PK] ' + pkRes.rows.map(r => r.column_name).join(', '));
    }

    const fkRes = await client.query(`
      SELECT
        kcu.column_name,
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
    `, [table]);
    for (const fk of fkRes.rows) {
      log('  [FK] ' + fk.column_name + ' -> ' + fk.foreign_table + '(' + fk.foreign_column + ')');
    }
  }

  await client.end();
  fs.writeFileSync(outputPath, output, 'utf8');
  console.log('Schema dump written to: ' + outputPath);
}

listSchemas().catch(err => {
  console.error(err);
  process.exit(1);
});
